"use strict";
const net = require("net");
const http = require("http");
const https = require("https");
const HttpsProxyAgent = require('https-proxy-agent');
const tea = require("crypto-tea");
const {randomBytes} = require("crypto");
const fs = require("fs");
const pb = require("./pb");
const jce = require("./jce");
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
 * @returns {Buffer}
 */
function buildHighwayUploadRequestPacket(o, cmd) {
    const head = pb.encode({
        1: {
            1: 1,
            2: String(this.uin),
            3: "PicUp.DataUp",
            4: randomBytes(2).readUInt16BE(),
            6: this.apk.subid,
            7: 4096,
            8: cmd,
            10:2052,
        },
        2: {
            2: o.buf.length,
            3: 0,
            4: o.buf.length,
            6: o.key,
            8: o.md5,
            9: o.md5,
        }
    });
    const _ = Buffer.allocUnsafe(9);
    _.writeUInt8(40);
    _.writeUInt32BE(head.length, 1);
    _.writeUInt32BE(o.buf.length, 5);
    const __ = Buffer.from([41]);
    return Buffer.concat([_, head, o.buf, __]);
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
            client.write(packet, client.end.bind(client));
        });
        client.on("end", resolve);
        client.on("close", resolve);
        client.on("error", resolve);
        var packet = buildHighwayUploadRequestPacket.call(this, o, cmd);
    })
}

/**
 * @param {String} url
 * @param {object|null} headers
 * @param {Number} timeout 
 * @param {Boolean} proxy 
 * @param {String} mime_type 
 * @returns {Promise<Buffer>}
 */
async function downloadFromWeb(url, headers, timeout, proxy, mime_type, maxsize = MAX_UPLOAD_SIZE, redirect = false) {
    if (timeout > 0 === false)
        timeout = 120;
    timeout = parseInt(timeout * 1000);
    const protocol = url.startsWith("https") ? https : http;
    if (typeof headers === "string") {
        try {
            headers = JSON.parse(headers);
        } catch {
            headers = null;
        }
    }
    const options = {timeout, headers};
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
                        resolve(await downloadFromWeb(res.headers["location"], headers, timeout, proxy, mime_type, maxsize, true));
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
async function downloadWebImage(url, proxy, timeout, headers = null) {
    return await downloadFromWeb(url, headers, timeout, proxy, "image");
}
async function downloadWebRecord(url, proxy, timeout, headers = null) {
    return await downloadFromWeb(url, headers, timeout, proxy, "", 0xfffffff);
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

/**
 * @this {import("./ref").Client}
 */
async function getTcpServer() {
    const key = Buffer.from("F0441F5FF42DA58FDCF7949ABA62D411", "hex");
    const HttpServerListReq = jce.encodeStruct([
        null,
        0, 0, 1, "00000", 100, this.apk.subid, this.device.imei, 0, 0, 0,
        0, 0, 0, 1
    ]);
    const extra = {
        service: "ConfigHttp",
        method:  "HttpServerListReq",
    };
    let body = jce.encodeWrapper({HttpServerListReq}, extra);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length + 4);
    body = Buffer.concat([len, body]);
    body = tea.encrypt(body, key);
    return await new Promise((resolve, reject)=>{
        const id = setTimeout(reject, 3000);
        https.request("https://configsvr.msf.3g.qq.com/configsvr/serverlist.jsp", {method: "POST"}, (res)=>{
            let data = [];
            res.on("error", reject);
            res.on("data", (chunk)=>data.push(chunk));
            res.on("end", ()=>{
                try {
                    clearTimeout(id);
                    data = Buffer.concat(data);
                    data = tea.decrypt(data, key).slice(4);
                    const nested = jce.decodeWrapper(data);
                    const parent = jce.decode(nested);
                    data = jce.decode(parent[2][0]);
                    resolve({
                        ip: data[1], port: data[2]
                    });
                } catch {
                    reject();
                }
            });
        }).on("error", reject).end(body);
    });
}

module.exports = {
    downloadWebImage, downloadWebRecord, highwayUpload, int32ip2str, readFile
};
