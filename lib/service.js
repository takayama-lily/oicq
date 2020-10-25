"use strict";
const net = require("net");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const pb = require("./pb");
const common = require("./common");
const MAX_UPLOAD_SIZE = 31457280;

function int32ip2str(ip) {
    if (typeof ip === "string")
        return ip;
    return [
        ip & 0xff,
        (ip & 0xff00 ) >> 8,
        (ip & 0xff0000 ) >> 16,
        (ip & 0xff000000 ) >> 24 & 0xff,
    ].join(".");
}

/**
 * @param {Object} o
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @param {Number} cmd 
 * @returns {Buffer[]}
 */
function buildHighwayUploadRequestPackets(o, cmd, seq = crypto.randomBytes(2).readUInt16BE()) {
    const packets = [], limit = MAX_UPLOAD_SIZE, size = o.buf.length;
    let chunk, offset = 0;
    while (1) {
        chunk = o.buf.slice(offset, offset + limit);
        if (!chunk.length) break;
        const head = pb.encode("ReqDataHighwayHead", {
            msgBasehead: {
                version:    1,
                uin:        String(this.uin),
                command:    "PicUp.DataUp",
                seq:        seq++,
                appid:      this.sub_appid,
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
        const _ = Buffer.allocUnsafe(9);
        _.writeUInt8(40);
        _.writeUInt32BE(head.length, 1);
        _.writeUInt32BE(chunk.length, 5);
        const __ = Buffer.from([41]);
        packets.push(Buffer.concat([_, head, chunk, __]));
    }
    return packets;
}

/**
 * @param {Number} ip Int32ip
 * @param {Number} port 
 * @param {Object} o 
 *  @field {Buffer} buf 
 *  @field {Buffer} md5 
 *  @field {Buffer} key 
 * @param {Number} cmd 
 * @returns {Promise}
 */
async function highwayUpload(ip, port, o, cmd) {
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
        var packets = buildHighwayUploadRequestPackets.call(this, o, cmd);
    })
}

/**
 * @async
 * @param {String} url 
 * @returns {Buffer}
 */
async function downloadFromWeb(url, timeout, mime_type, maxsize = MAX_UPLOAD_SIZE, redirect = false) {
    const protocol = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject)=>{
        try {
            protocol.get(url, {timeout}, async(res)=>{
                // 重定向一次(没有好的库暂时手动实现)
                if (String(res.statusCode).startsWith("3") && !redirect && res.headers["location"]) {
                    try {
                        resolve(await downloadFromWeb(res.headers["location"], timeout, mime_type, maxsize, true));
                    } catch (e) {
                        reject(e);
                    }
                    return;
                }
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
    downloadWebImage, downloadWebRecord, highwayUpload, int32ip2str
}
