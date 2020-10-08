"use strict";
const zlib = require("zlib");
const net = require("net");
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const tea = require("crypto-tea");
const pb = require("../pb");
const common = require("../common");
const BUF0 = Buffer.alloc(0);
const MAX_UPLOAD_SIZE = 31457280;

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
    const packets = [], limit = MAX_UPLOAD_SIZE, size = o.buf.length;
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
                appid:      537064989,
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
            }
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
 * @param {object[]} images
 *  @field {Buffer} md5
 *  @field {Number} size
 */
async function imageStore(group_id, images) {
    this.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            groupCode:      group_id,
            srcUin:         this.uin,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            picType:        1000,
            buildVer:       "8.2.7.4410",
            appPicType:     1006,
            fileIndex:      BUF0,
            transferUrl:    BUF0,
        });
    }
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  1,
        msgTryUpImgReq: req,
        extension: BUF0,
    });
    const blob = await this.sendUNI("ImgStore.GroupPicUp", body);
    return pb.decode("D388RespBody", blob);
}

async function offPicUp(user_id, images) {
    this.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            srcUin:         this.uin,
            dstUin:         user_id,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            imgOriginal:    1,
            imgType:        1000,
            buildVer:       "8.2.7.4410",
            srvUpload:      1,
        });
    }
    const body = pb.encode("OffPicUpReqBody", {
        subcmd:  1,
        msgTryUpImgReq: req
    });
    const blob = await this.sendUNI("LongConn.OffPicUp", body);
    return pb.decode("OffPicUpRspBody", blob);
}

async function uploadImages(target, images, is_group) {
    let resp = await (is_group?imageStore:offPicUp).call(this, target, images);
    for (let i = 0; i < images.length; ++i) {
        const v = resp.msgTryUpImgRsp[i];
        if (v.boolFileExit || !images[i].buf) continue;
        const index = i % v.uint32UpIp.length;
        v.md5 = images[i].md5, v.buf = images[i].buf, v.key = v.upUkey;
        highwayUpload(this.uin, v.uint32UpIp[index], v.uint32UpPort[index], v, is_group?2:1);
    }
    return resp;
}

async function uploadMultiMessage(target, msg, bu) {
    this.nextSeq();
    const compressed = zlib.gzipSync(pb.encode("PbMultiMsgTransmit", {
        msg, pbItemList: [{
            fileName: "MultiMsg",
            buffer:   pb.encode("PbMultiMsgNew", {msg}),
        }]
    }));
    const body = pb.encode("MultiReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         bu,
        reqChannelType: 0,
        multimsgApplyupReq: [{
            applyId:    0,
            dstUin:     target,
            msgSize:    compressed.length,
            msgMd5:     common.md5(compressed),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyUp", body);
    let resp = pb.decode("MultiRspBody", blob);
    resp = resp.multimsgApplyupRsp[0];
    if (resp.result > 0)
        throw new Error();
    const buf = pb.encode("LongReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        msgUpReq:       [{
            msgType:    3,
            dstUin:     target,
            msgContent: compressed,
            storeType:  2,
            msgUkey:    resp.msgUkey,
        }],
    });
    const o = {
        buf: buf,
        md5: common.md5(buf),
        key: resp.msgSig
    }
    highwayUpload(this.uin, resp.uint32UpIp[0], resp.uint32UpPort[0], o, 27);
    return resp;
}

async function uploadPtt(target, ptt) {
    this.nextSeq();
    const req = [];
    req.push({
        groupCode:      target,
        srcUin:         this.uin,
        fileMd5:        ptt.md5,
        fileSize:       ptt.size,
        fileName:       ptt.md5,
        fileId:         0,
        srcTerm:        5,
        platformType:   9,
        buType:         4,
        innerIp:        0,
        buildVer:       "6.5.5.663",
        voiceLength:    1,
        codec:          ptt.ext===".amr"?0:1,
        voiceType:      1,
        boolNewUpChan:  true,
    });
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  3,
        msgTryUpPttReq: req,
        extension: BUF0,
    });
    const blob = await this.sendUNI("PttStore.GroupPttUp", body);
    let resp = pb.decode("D388RespBody", blob);
    resp = resp.msgTryUpPttRsp[0];

    if (!resp.boolFileExit) {
        const ip = int32ip2str(resp.uint32UpIp[0]), port = resp.uint32UpPort[0];
        const ukey = resp.upUkey.toString("hex"), filekey = resp.fileKey.toString("hex");
        const params = {
            ver: 4679, ukey, filekey,
            filesize: ptt.size, bmd5: ptt.md5.toString("hex"),
            mType: "pttDu", voice_encodec: ptt.ext===".amr"?0:1
        }
        const url = `http://${ip}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": "QQ/8.2.0.1296 CFNetwork/1126",
            "Net-Type": "Wifi"
        };
        await new Promise((resolve)=>{
            http.request(url, {method: 'POST', headers}, resolve)
                .on("error", resolve)
                .end(ptt.buf);
        })
    }
    return resp;
}

async function downloadMultiMsg(resid, bu) {
    this.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         2,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         bu,
        reqChannelType: 2,
        multimsgApplydownReq: [{
            msgResid:   Buffer.from(resid),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyDown", body);
    let resp = pb.decode("MultiRspBody", blob);

    resp = resp.multimsgApplydownRsp[0];
    const url = `http://${int32ip2str(resp.uint32DownIp[0])}:${resp.uint32DownPort[0]}` + resp.thumbDownPara.toString();
    const headers = {
        "User-Agent": "QQ/8.2.0.1296 CFNetwork/1126",
        "Net-Type": "Wifi"
    };
    return new Promise((resolve, reject)=>{
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
                    buf = zlib.unzipSync(buf.msgDownRsp[0].msgContent);
                    resolve(pb.decode("PbMultiMsgTransmit", buf));
                } catch (e) {
                    reject();
                }
            })
        }).on("error", reject);
    });
}

async function getGroupFileUrl(group_id, bus_id, file_id) {
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     1750,
        serviceType: 2,
        bodybuffer:  pb.encode("D6D6ReqBody", {
            downloadFileReq: {
                groupCode: group_id,
                appId:     3,
                busId:     bus_id,
                fileId:    file_id,
            }
        }),
    });
    const blob = await this.sendUNI("OidbSvc.0x6d6_2", body);
    return pb.decode("D6D6RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
}

/**
 * @async
 * @param {String} url 
 * @returns {Buffer}
 */
async function downloadFromWeb(url, timeout, mime_type, maxsize = MAX_UPLOAD_SIZE) {
    const protocol = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject)=>{
        try {
            protocol.get(url, {timeout}, (res)=>{
                if (mime_type && (!res.headers["content-type"] || !res.headers["content-type"].includes(mime_type))) {
                    reject(url + " 不是合法的"+mime_type+"文件。");
                    return;
                }
                if (res.headers["content-length"] && res.headers["content-length"] > maxsize) {
                    reject(url + " 文件体积太大。");
                    return;
                }
                let data = [];
                res.on("data", (chunk)=>{
                    data.push(chunk);
                });
                res.on("end", ()=>{
                    data = Buffer.concat(data);
                    if (data.length > maxsize)
                        reject(url + " 文件体积太大。");
                    else
                        resolve(data);
                });
            }).on("error", (e)=>{
                reject(e.message);
            });
        } catch (e) {
            reject(e.message);
        }
    });
}

async function downloadWebImage(url) {
    const config = process.OICQ.config;
    const timeout = config.web_image_timeout > 0 ? config.web_image_timeout * 1000 : 120000;
    const mime_type = "image";
    try {
        return await downloadFromWeb.call(this, url, timeout, mime_type);
    } catch (e) {
        this.logger.warn(e);
        return;
    }
}
async function downloadWebRecord(url) {
    const config = process.OICQ.config;
    const timeout = config.web_record_timeout > 0 ? config.web_record_timeout * 1000 : 120000;
    const mime_type = "";
    return await downloadFromWeb.call(this, url, timeout, mime_type, 0xfffffff);
}

module.exports = {
    uploadImages, uploadPtt, uploadMultiMessage, downloadMultiMsg, getGroupFileUrl,
    downloadWebImage, downloadWebRecord
}
