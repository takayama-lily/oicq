/**
 * tcp上传数据
 * 网络下载
 */
"use strict";
const stream = require("stream");
const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { randomBytes } = require("crypto");
const tea = require("./algo/tea");
const pb = require("./algo/pb");
const { md5, NOOP, BUF0} = require("./common");
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

class HighwayTransform extends stream.Transform {

    seq = randomBytes(2).readUInt16BE();
    offset = 0;
    __ = Buffer.from([41]);

    /**
     * @param {import("./ref").Client} c 
     * @param {import("./ref").HighwayUploadStreamObject} obj 
     */
    constructor(c, obj) {
        super();
        this.c = c;
        this.cmd = obj.cmd;
        this.md5 = obj.md5;
        this.size = obj.size;
        this.ticket = obj.ticket || this.c.storage.sig_session;
        this.ext = obj.encrypt ? tea.encrypt(obj.ext, this.c.storage.session_key) : obj.ext;
        this.on("error", NOOP);
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
                    8: md5(chunk),
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
        callback(null);
    }
}

const ERROR_HIGHWAY_FAILED = new Error("ERROR_HIGHWAY_FAILED");

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
        const highway = new HighwayTransform(this, obj);
        const socket = net.connect(
            port, ip,
            () => readable.pipe(highway).pipe(socket, { end: false })
        );
        const handleRspHeader = (header) => {
            const rsp = pb.decode(header);
            if (typeof rsp[3] === "number" && rsp[3] !== 0) {
                this.logger.warn(`highway upload failed (code: ${rsp[3]})`);
                readable.unpipe(highway).destroy();
                highway.unpipe(socket).destroy();
                socket.end();
                throw ERROR_HIGHWAY_FAILED;
            } else {
                const percentage = ((rsp[2][3] + rsp[2][4]) / rsp[2][2] * 100).toFixed(2);
                this.logger.debug(`highway chunk uploaded (${percentage}%)`);
                if (typeof obj.callback === "function")
                    obj.callback(percentage)
                if (percentage >= 100)
                    socket.end();
            }
        }
        let _data = BUF0;
        socket.on("data", (data) => {
            try {
                _data = _data.length ? Buffer.concat([_data, data]) : data;
                while (_data.length >= 5) {
                    const len = _data.readInt32BE(1);
                    if (_data.length >= len + 10) {
                        handleRspHeader(_data.slice(9, len + 9));
                        _data = _data.slice(len + 10);
                    }
                }
            } catch { }
        });
        socket.on("close", resolve);
        socket.on("error", (err) => {
            this.logger.warn(err);
        });
        readable.on("error", (err) => {
            this.logger.warn(err);
            socket.end();
        });
    });
}

const ERROR_SIZE_TOO_BIG = new Error("文件体积超过30MB，拒绝下载");

class DownloadTransform extends stream.Transform {
    _size = 0;
    _transform(data, encoding, callback) {
        this._size += data.length;
        if (this._size <= MAX_UPLOAD_SIZE) {
            this.push(data);
        }
        callback(null);
    }
}

/**
 * 下载(最大30M)
 * @param {http.OutgoingHttpHeader|undefined|string} headers
 * @returns {Promise<stream.Readable>}
 */
function downloadFromWeb(url, headers, redirect = 0) {
    if (typeof headers === "string") {
        try {
            headers = JSON.parse(headers);
        } catch {
            headers = null;
        }
    }
    return new Promise((resolve, reject) => {
        (url.startsWith("https") ? https : http).get(url, { headers }, (res) => {
            if (redirect < 3 && String(res.statusCode).startsWith("3") && res.headers["location"]) {
                let location = res.headers["location"];
                if (!location.startsWith("http"))
                    location = new URL(url).origin + location;
                return downloadFromWeb(location, headers, redirect + 1)
                    .then(resolve)
                    .catch(reject);
            }
            if (res.statusCode !== 200) {
                res.destroy();
                return reject(new Error("http status code: " + res.statusCode));
            }
            if (res.headers["content-length"] && res.headers["content-length"] > MAX_UPLOAD_SIZE) {
                res.destroy();
                return reject(ERROR_SIZE_TOO_BIG);
            }
            resolve(res.pipe(new DownloadTransform));
        }).on("error", reject);
    });
}

module.exports = {
    downloadFromWeb, highwayUploadStream, int32ip2str, MAX_UPLOAD_SIZE,
};
