"use strict";
const net = require("net");
const https = require("https");
const { BUF0, timestamp } = require("./common");
const tea = require("./algo/tea");
const jce = require("./algo/jce");

const default_host = "msfwifi.3g.qq.com";
const default_port = 8080;
let update_time = 0;
let host_port = { };

class Network extends net.Socket {

    closed_time = timestamp();
    host = default_host;
    port = default_port;
    _data = BUF0;

    /**
     * @param {import("./ref").Client} c 
     */
    constructor(c) {
        super();
        this.c = c;

        this.on("error", (err) => {
            this.c.logger.error(err.message);
        });

        this.on("close", () => {
            this._data = BUF0;
            if (this.remoteAddress)
                this.c.logger.mark(`${this.remoteAddress}:${this.remotePort} closed`);
            if (timestamp() - this.closed_time <= 300)
                delete host_port[this.remoteAddress];
            this.closed_time = timestamp();
            this.c.emit("internal.offline");
        });

        this.on("data", (data) => {
            this._data = this._data.length === 0 ? data : Buffer.concat([this._data, data]);
            while (this._data.length > 4) {
                let len = this._data.readUInt32BE();
                if (this._data.length >= len) {
                    const packet = this._data.slice(4, len);
                    this._data = this._data.slice(len);
                    this.c.emit("internal.packet", packet);
                } else {
                    break;
                }
            }
        });
    }

    async join(cb) {
        if (timestamp() - this.closed_time > 300) {
            //
        } else if (net.isIP(this.c.config.remote_ip)) {
            this.host = this.c.config.remote_ip;
            this.port = 8080;
            if (this.c.config.remote_port > 0 && this.c.config.remote_port < 65536)
                this.host = this.c.config.remote_port;
        } else if (this.c.config.auto_server) {
            if (!Object.keys(host_port).length || timestamp() - update_time >= 3600) {
                this.c.logger.mark("正在探索可用服务器...");
                try {
                    await this._queryServerList();
                    this.host = Object.keys(host_port)[0];
                    this.port = host_port[this.host];
                } catch (err) {
                    this.c.logger.warn("探索服务器失败: " + (err ? err.message : "timeout"));
                }
            } else {
                this.host = Object.keys(host_port)[0];
                this.port = host_port[this.host];
            }
        }
        this.c.logger.mark(`connecting to ${this.host}:${this.port}`);
        this.removeAllListeners("connect");
        this.connect(this.port, this.host, () => {
            this.c.logger.mark(`${this.remoteAddress}:${this.remotePort} connected`);
            cb();
        });
    }

    async _queryServerList() {
        const key = Buffer.from("F0441F5FF42DA58FDCF7949ABA62D411", "hex");
        const HttpServerListReq = jce.encodeStruct([
            null,
            0, 0, 1, "00000", 100, this.c.apk.subid, this.c.device.imei, 0, 0, 0,
            0, 0, 0, 1
        ]);
        const extra = {
            service: "ConfigHttp",
            method: "HttpServerListReq",
        };
        let body = jce.encodeWrapper({ HttpServerListReq }, extra);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(body.length + 4);
        body = Buffer.concat([len, body]);
        body = tea.encrypt(body, key);
        return await new Promise((resolve, reject) => {
            const id = setTimeout(reject, 5000);
            https.request("https://configsvr.msf.3g.qq.com/configsvr/serverlist.jsp", { method: "POST" }, (res) => {
                let data = [];
                res.on("error", reject);
                res.on("data", (chunk) => data.push(chunk));
                res.on("end", () => {
                    try {
                        clearTimeout(id);
                        data = Buffer.concat(data);
                        data = tea.decrypt(data, key).slice(4);
                        const nested = jce.decode(data);
                        host_port = { };
                        for (let v of nested[2]) {
                            if (Object.keys(host_port).length >= 3)
                                continue;
                            host_port[v[1]] = v[2];
                        }
                        if (Object.keys(host_port).length > 0) {
                            update_time = timestamp();
                            this.c.logger.debug(host_port);
                            resolve();
                        } else {
                            reject(new Error("no aliveable server"));
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on("error", reject).end(body);
        });
    }
}

module.exports = Network;

/**
 * 关于探索服务器：
 * 由于tx服务器偶尔会抽风，若固定使用域名msfwifi.3g.qq.com连接，遇到抽风的IP会炸
 * 探索服务器每次获得3个理论最优IP，一小时内只进行一次探索，除非IP已经用完
 * 在连接后5分钟内若出现断线，则判断此IP抽风，将其排除
 * 5分钟之外的断线则正常重连
 * 同一线程中的所有客户端实例共用一个IP池
 */
