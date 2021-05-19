"use strict";
const net = require("net");
const { BUF0 } = require("./common");

class Network extends net.Socket {

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

    join(cb) {
        let ip = "msfwifi.3g.qq.com", port = 8080;
        if (net.isIP(this.c.config.remote_ip))
            ip = this.c.config.remote_ip;
        if (this.c.config.remote_port > 0 && this.c.config.remote_port < 65536)
            port = this.c.config.remote_port;
        this.c.logger.mark(`connecting to ${ip}:${port}`);
        this.removeAllListeners("connect");
        this.connect(port, ip, () => {
            this.c.logger.mark(`${this.remoteAddress}:${this.remotePort} connected`);
            cb();
        });
    }
}

module.exports = Network;
