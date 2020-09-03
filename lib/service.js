"use strict";
const zlib = require("zlib");
const net = require("net");
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const tea = require("crypto-tea");
const pb = require("./pb");
const common = require("./common");
const BUF0 = Buffer.alloc(0);
const MAX_IMG_SIZE = 31457280;

function int32ip2str(ip) {
    return [
        ip & 0xff,
        (ip & 0xff00 ) >> 8,
        (ip & 0xff0000 ) >> 16,
        (ip & 0xff000000 ) >> 24 & 0xff,
    ].join(".");
}

/**
 * @param {Number} uin 
 * @param {Object} o
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @param {Number} cmd 
 * @returns {Buffer[]}
 */
function buildHighwayUploadRequestPackets(uin, o, cmd, seq = common.rand()) {
    uin = uin.toString();
    const packets = [], limit = MAX_IMG_SIZE, size = o.buf.length;
    let chunk, offset = 0;
    while (1) {
        chunk = o.buf.slice(offset, offset + limit);
        if (!chunk.length) break;
        const head = pb.encode("ReqDataHighwayHead", {
            msgBasehead: {
                version:    1,
                uin:        uin,
                command:    "PicUp.DataUp",
                seq:        seq++,
                appid:      537062409,
                dataflag:   4096,
                commandId:  cmd,
                localeId:   2052,
            },
            msgSeghead: {
                filesize:       size,
                dataoffset:     offset,
                datalength:     chunk.length,
                serviceticket:  o.key,
                md5:            common.md5(chunk),
                fileMd5:        o.md5,
            },
            reqExtendinfo: BUF0,
        });
        offset += limit;
        const _ = Buffer.alloc(9);
        _.writeUInt8(40);
        _.writeUInt32BE(head.length, 1);
        _.writeUInt32BE(chunk.length, 5);
        const __ = Buffer.from([41]);
        packets.push(Buffer.concat([_, head, chunk, __]));
    }
    return packets;
}

/**
 * @async
 * @param {Number} uin 
 * @param {Number} ip Int32ip
 * @param {Number} port 
 * @param {Object} o 
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @param {Number} cmd 
 * @returns {Promise}
 */
async function highwayUpload(uin, ip, port, o, cmd) {
    ip = int32ip2str(ip);
    return new Promise((resolve)=>{
        const client = net.connect(port, ip, ()=>{
            let n = 0;
            packets.forEach((v)=>{
                client.write(v, ()=>{
                    ++n;
                    if (n === packets.length) {
                        client.end();
                        resolve();
                    }
                });
            });
        });
        client.on("close", resolve);
        client.on("error", resolve);
        var packets = buildHighwayUploadRequestPackets(uin, o, cmd);
    })
}

/**
 * @async
 * @param {Number} uin 
 * @param {Number[]} ips 
 * @param {Number[]} ports 
 * @param {Object[]} images 
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @returns {Promise} 
 */
async function uploadImages(uin, ips, ports, images) {
    const tasks = [];
    for (let i = 0; i < images.length; ++i) {
        const v = images[i];
        if (v.exists || !v.buf) continue;
        const index = i % ips.length;
        tasks.push(highwayUpload(uin, ips[index], ports[index], v, 2));
    }
    await Promise.all(tasks);
}

/**
 * @async
 * @param {Number} uin 
 * @param {Number[]} ips 
 * @param {Number[]} ports 
 * @param {Object} o 
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @returns {Promise} 
 */
async function uploadMultiMessage(uin, ips, ports, o) {
    await highwayUpload(uin, ips[0], ports[0], o, 27);
}

async function uploadPtt(o, resp) {
    const ip = int32ip2str(resp.uint32UpIp[0]), port = resp.uint32UpPort[0];
    const ukey = resp.upUkey.toString("hex"), filekey = resp.fileKey.toString("hex");
    const params = {
        ver: 4679, ukey, filekey,
        filesize: o.size, bmd5: o.md5.toString("hex"),
        mType: "pttDu", voice_encodec: o.ext===".amr"?0:1
    }
    const url = `http://${ip}:${port}/?` + querystring.stringify(params);
    const headers = {
        "User-Agent": "QQ/8.2.0.1296 CFNetwork/1126",
        "Net-Type": "Wifi"
    };
    return new Promise((resolve)=>{
        http.request(url, {method: 'POST', headers}, resolve)
            .on("error", resolve)
            .end(o.buf);
    })
    
}

async function downloadRichMsg(app_down_resp) {
    const resp = app_down_resp.multimsgApplydownRsp[0];
    const url = `http://${int32ip2str(resp.uint32DownIp[0])}:${resp.uint32DownPort[0]}` + resp.thumbDownPara.toString();
    const headers = {
        "User-Agent": "QQ/8.2.0.1296 CFNetwork/1126",
        "Net-Type": "Wifi"
    };
    return new Promise((resolve, reject)=>{
        console.log(url, headers);
        http.get(url, {headers}, (res)=>{
            const data = [];
            res.on("data", (chunk)=>data.push(chunk));
            res.on("end", ()=>{
                try {
                    let buf = Buffer.concat(data);
                    if (res.headers["accept-encoding"] && res.headers["accept-encoding"].includes("gzip"))
                        buf = zlib.unzipSync(buf);
                    const head_len = buf.readUInt32BE(1);
                    const body_len = buf.readUInt32BE(5);
                    buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), resp.msgKey);
                    buf = pb.decode("LongRspBody", buf);
                    console.log(buf)
                    buf = zlib.unzipSync(buf.msgDownRsp[0].msgContent);
                    resolve(pb.decode("PbMultiMsgTransmit", buf));
                } catch (e) {
                    console.log(e)
                    reject();
                }
            })
        }).on("error", reject);
    });
}

/**
 * @async
 * @param {*} url 
 * @returns {Buffer}
 */
async function downloadFromWeb(url, timeout, maxsize, mime_type) {
    const protocol = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject)=>{
        try {
            protocol.get(url, {timeout}, (res)=>{
                if (mime_type && (!res.headers["content-type"] || !res.headers["content-type"].includes(mime_type))) {
                    reject();
                    return;
                }
                if (res.headers["content-length"] && res.headers["content-length"] > maxsize) {
                    reject();
                    return;
                }
                let data = [];
                res.on("data", (chunk)=>{
                    data.push(chunk);
                });
                res.on("end", ()=>{
                    data = Buffer.concat(data);
                    if (data.length > maxsize)
                        reject();
                    else
                        resolve(data);
                });
            }).on("error", reject);
        } catch (e) {
            reject();
        }
    });
}

async function downloadWebImage(url) {
    const config = process.OICQ.config;
    const timeout = config.web_image_timeout > 0 ? config.web_image_timeout * 1000 : 120000;
    const maxsize = config.web_image_maxsize > 0 ? config.web_image_maxsize * 1024 : MAX_IMG_SIZE;
    if (maxsize > MAX_IMG_SIZE)
        maxsize = MAX_IMG_SIZE;
    const mime_type = "image";
    return await downloadFromWeb(url, timeout, maxsize, mime_type);
}
async function downloadWebRecord(url) {
    const config = process.OICQ.config;
    const timeout = config.web_record_timeout > 0 ? config.web_record_timeout * 1000 : 120000;
    const maxsize = config.web_record_maxsize > 0 ? config.web_record_maxsize * 1024 : 0xfffffff;
    const mime_type = "";
    return await downloadFromWeb(url, timeout, maxsize, mime_type);
}

module.exports = {
    uploadImages, uploadPtt, uploadMultiMessage, downloadRichMsg, downloadWebImage, downloadWebRecord
}
