/**
 * tcp上传数据
 * 网络下载
 */
"use strict";
const stream = require("stream");
const net = require("net");
const http = require("http");
const https = require("https");
const tea = require("./tea");
const { randomBytes } = require("crypto");
const pb = require("./pb");
const common = require("./common");
const MAX_UPLOAD_SIZE = 31457280;

/**
 * 数字ip转换成通用ip
 * @param {number|string} ip 
 */
function int32ip2str(ip) {
    if (typeof ip === "string")
        return ip;
    ip = ip & 0xffffffff;
    return [
        ip & 0xff,
        (ip & 0xff00) >> 8,
        (ip & 0xff0000) >> 16,
        (ip & 0xff000000) >> 24 & 0xff,
    ].join(".");
}

class HighwayStream extends stream.Transform {

    seq = randomBytes(2).readUInt16BE();
    offset = 0;
    __ = Buffer.from([41]);

    /**
     * @param {import("./ref").Client} c 
     * @param {import("./ref").HighwayUploadStreamObject} obj 
     */
    constructor(c, obj) {
        super({ highWaterMark: 1048576 });
        this.c = c;
        this.cmd = obj.cmd;
        this.md5 = obj.md5;
        this.size = obj.size;
        this.ticket = obj.ticket || this.c.storage.sig_session;
        this.ext = obj.encrypt ? tea.encrypt(obj.ext, this.c.storage.session_key) : obj.ext;
        this.on("error", common.NOOP);
    }

    _transform(data, encoding, callback) {
        let offset = 0, limit = 1048576;
        while (offset < data.length) {
            const chunk = data.slice(offset, limit + offset);
            const head = pb.encode({
                1: {
                    1: 1,
                    2: String(this.c.uin),
                    3: "PicUp.DataUp",
                    4: this.seq++,
                    6: this.c.apk.subid,
                    7: 4096,
                    8: this.cmd,
                    10: 2052,
                },
                2: {
                    2: this.size,
                    3: this.offset + offset,
                    4: chunk.length,
                    6: this.ticket,
                    8: common.md5(chunk),
                    9: this.md5,
                },
                3: this.ext
            });
            offset += chunk.length;
            const _ = Buffer.allocUnsafe(9);
            _.writeUInt8(40);
            _.writeUInt32BE(head.length, 1);
            _.writeUInt32BE(chunk.length, 5);
            this.push(_);
            this.push(head);
            this.push(chunk);
            this.push(this.__);
        }
        this.offset += data.length;
        callback();
    }
}

/**
 * 将一个可读流经过转换后上传
 * @this {import("./ref").Client}
 * @param {stream.Readable} readable
 * @param {import("./ref").HighwayUploadStreamObject} obj
 */
function highwayUploadStream(readable, obj, ip, port) {
    ip = int32ip2str(ip || this.storage.ip);
    port = port || this.storage.port;
    this.logger.debug(`highway ip:${ip} port:${port}`);
    return new Promise((resolve) => {
        const conn = net.connect(port, ip, () => {
            const highway = new HighwayStream(this, obj);
            conn.on("data", (data) => {
                try {
                    const len = data.readInt32BE(1);
                    const rsp = pb.decode(data.slice(9, len + 9));
                    if (typeof rsp[3] === "number" && rsp[3] !== 0) {
                        this.logger.warn(`highway upload failed (code: ${rsp[3]})`);
                        readable.unpipe(highway).destroy();
                        highway.unpipe(conn).destroy();
                        conn.destroy();
                    } else {
                        const percent = (rsp[2][3] + rsp[2][4]) / rsp[2][2] * 100;
                        this.logger.debug(`highway chunk uploaded (${percent.toFixed(2)}%)`);
                        if (percent >= 100)
                            conn.destroy();
                    }
                } catch { }
            });
            readable.pipe(highway).pipe(conn);
        });
        conn.on("close", resolve);
        conn.on("error", (err) => {
            this.logger.error(err);
        });
        readable.on("error", (err) => {
            this.logger.error(err);
            conn.destroy();
        });
    });
}

/**
 * 下载(最大30M)
 * @param {string} url
 * @param {http.OutgoingHttpHeader|undefined|string} headers
 * @param {number|undefined} timeout 
 * @param {boolean} redirect 
 * @returns {Promise<Buffer>}
 */
function downloadFromWeb(url, timeout, headers, redirect = false) {
    const maxsize = MAX_UPLOAD_SIZE;
    if (timeout > 0 === false)
        timeout = 60;
    const protocol = url.startsWith("https") ? https : http;
    if (typeof headers === "string") {
        try {
            headers = JSON.parse(headers);
        } catch {
            headers = null;
        }
    }
    const options = { headers };
    return new Promise((resolve, reject) => {
        const req = protocol.get(url, options, (res) => {
            if (String(res.statusCode).startsWith("3") && !redirect && res.headers["location"]) {
                return downloadFromWeb(res.headers["location"], timeout, headers, true)
                    .then(resolve)
                    .catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject("http status code: " + res.statusCode);
            }
            if (res.headers["content-length"] && res.headers["content-length"] > maxsize) {
                return reject(`文件体积太大(maxsize=${maxsize})。`);
            }
            let data = [], size = 0;
            res.on("data", (chunk) => {
                size += chunk.length;
                if (size > maxsize) {
                    res.destroy();
                    reject(`文件体积太大(maxsize=${maxsize})。`);
                } else {
                    data.push(chunk);
                }
            });
            res.on("end", () => {
                resolve(Buffer.concat(data));
            });
        });
        req.on("error", (e) => {
            reject(e.message);
        });
        setTimeout(() => {
            req.destroy();
            reject(`下载超时 (${timeout}s)`);
        }, timeout * 1000);
    });
}

module.exports = {
    downloadFromWeb, highwayUploadStream, int32ip2str, MAX_UPLOAD_SIZE,
};
