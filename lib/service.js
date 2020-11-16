"use strict";
const net = require("net");
const http = require("http");
const https = require("https");
const HttpsProxyAgent = require('https-proxy-agent');
const crypto = require("crypto");
const fs = require("fs");
const pb = require("./pb");
const common = require("./common");
const MAX_UPLOAD_SIZE = 31457280;

function int32ip2str(ip) {
    if (typeof ip === "string")
        return ip;
    ip = ip & 0xffffffff;
    return [
        ip & 0xff,
        (ip & 0xff00 ) >> 8,
        (ip & 0xff0000 ) >> 16,
        (ip & 0xff000000 ) >> 24 & 0xff,
    ].join(".");
}

/**
 * @this {import("./ref").Client}
 * @param {import("./ref").HighwayUploadObject} o
 * @param {Number} cmd 
 * @returns {Buffer[]}
 */
function buildHighwayUploadRequestPackets(o, cmd, seq = crypto.randomBytes(2).readUInt16BE()) {
    const packets = [], limit = MAX_UPLOAD_SIZE, size = o.buf.length;
    let chunk, offset = 0;
    while (1) {
        chunk = o.buf.slice(offset, offset + limit);
        if (!chunk.length) break;
        const head = pb.encode({
            1: {
                1: 1,
                2: String(this.uin),
                3: "PicUp.DataUp",
                4: seq++,
                6: this.apk.subid,
                7: 4096,
                8: cmd,
                10:2052,
            },
            2: {
                2: size,
                3: offset,
                4: chunk.length,
                6: o.key,
                8: common.md5(chunk),
                9: o.md5,
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
 * @this {import("./ref").Client}
 * @param {Number|String} ip Int32ip
 * @param {Number} port 
 * @param {import("./ref").HighwayUploadObject} o
 * @param {Number} cmd 
 * @returns {Promise<void>}
 */
async function highwayUpload(ip, port, o, cmd) {
    ip = int32ip2str(ip);
    this.logger.trace(`highway ip:${ip} port:${port}`);
    return new Promise((resolve)=>{
        const client = net.connect(port, ip, ()=>{
            let n = 0;
            packets.forEach((v)=>{
                client.write(v, ()=>{
                    ++n;
                    if (n === packets.length) {
                        client.end();
                    }
                });
            });
        });
        client.on("end", resolve);
        client.on("close", resolve);
        client.on("error", resolve);
        var packets = buildHighwayUploadRequestPackets.call(this, o, cmd);
    })
}

/**
 * @param {String} url
 * @param {Number} timeout 
 * @param {Boolean} proxy 
 * @param {String} mime_type 
 * @returns {Promise<Buffer>}
 */
async function downloadFromWeb(url, timeout, proxy, mime_type, maxsize = MAX_UPLOAD_SIZE, redirect = false) {
    if (timeout > 0 === false)
        timeout = 120;
    timeout = parseInt(timeout * 1000);
    const protocol = url.startsWith("https") ? https : http;
    const options = {timeout};
    if (proxy && process.env.http_proxy) {
        try {
            const agent = new HttpsProxyAgent(process.env.http_proxy);
            options.agent = agent;
        } catch (e) {
            console.log(e);
        }
    }
    return new Promise((resolve, reject)=>{
        try {
            const req = protocol.get(url, options, async(res)=>{
                // 重定向一次(没有好的库暂时手动实现)
                if (String(res.statusCode).startsWith("3") && !redirect && res.headers["location"]) {
                    try {
                        resolve(await downloadFromWeb(res.headers["location"], timeout, proxy, mime_type, maxsize, true));
                    } catch (e) {
                        reject(e);
                    }
                    return;
                }
                if (res.statusCode !== 200) {
                    reject("http status code: " + res.statusCode);
                    return;
                }
                if (mime_type && (!res.headers["content-type"] || !res.headers["content-type"].includes(mime_type))) {
                    reject("不是合法的"+mime_type+"文件。");
                    return;
                }
                if (res.headers["content-length"] && res.headers["content-length"] > maxsize) {
                    reject(`文件体积太大(maxsize=${maxsize})。`);
                    return;
                }
                let data = Buffer.alloc(0);
                res.on("data", (chunk)=>{
                    data = Buffer.concat([data, chunk]);
                    if (data.length >= maxsize) {
                        res.destroy();
                        reject(`文件体积太大(maxsize=${maxsize})。`);
                    }
                });
                res.on("end", ()=>{
                    resolve(data);
                });
            });
            req.on("error", (e)=>{
                reject(e.message);
            }).on("timeout", ()=>{
                req.destroy();
                reject("connect ETIMEDOUT");
            });
        } catch (e) {
            reject(e.message);
        }
    });
}

/**
 * @param {String} url
 * @param {Boolean} proxy 
 * @param {Number} timeout 
 */
async function downloadWebImage(url, proxy, timeout) {
    return await downloadFromWeb(url, timeout, proxy, "image");
}
async function downloadWebRecord(url, proxy, timeout) {
    return await downloadFromWeb(url, timeout, proxy, "", 0xfffffff);
}

async function readFile(path, maxsize = MAX_UPLOAD_SIZE) {
    const stream = fs.createReadStream(path, {highWaterMark: 1024 * 5120});
    return new Promise((resolve, reject)=>{
        let data = Buffer.alloc(0);
        stream.on("data", (chunk)=>{
            data = Buffer.concat([data, chunk]);
            if (data.length >= maxsize) {
                stream.destroy();
                reject(`文件体积太大(maxsize=${maxsize})。`);
            }
        });
        stream.on("end", ()=>{
            resolve(data);
        });
        stream.on("error", (e)=>{
            reject(e.message);
        });
    });
}

module.exports = {
    downloadWebImage, downloadWebRecord, highwayUpload, int32ip2str, readFile
};
