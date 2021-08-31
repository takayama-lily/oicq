"use strict";
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const Readable = require("stream").Readable;
const tea = require("../algo/tea");
const jce = require("../algo/jce");
const pb = require("../algo/pb");
const Ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const { timestamp, md5, BUF16, BUF0, NOOP } = require("../common");

const BUF_UNKNOWN = Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);

class WtLogin {

    tlvPacker = tlv.getPacker(this);
    ecdh = new Ecdh;

    t104; //滑动验证码、短信验证、设备锁用
    t174; //短信验证用
    phone; //密保手机号，短信验证用

    token_flag = false;

    session_id = randomBytes(4);
    random_key = randomBytes(16);

    qrcode_sig; //用于扫码登录

    get logger() { return this.c.logger; }
    get dir() { return this.c.dir; }
    get uin() { return this.c.uin; }
    get password_md5() { return this.c.password_md5; }
    get device() { return this.c.device; }
    get apk() { return this.c.apk; }
    get seq_id() { return this.c.seq_id; }
    get cookies() { return this.c.cookies; }
    get ksid() {
        return Buffer.from(`|${this.device.imei}|` + this.apk.name);
    }
    get sig() { return this.c.sig; }
    set sig(val) { this.c.sig = val; }
    set nickname(val) { this.c.nickname = val; }
    set sex(val) { this.c.sex = val; }
    set age(val) { this.c.age = val; }

    /**
     * @param {import("../ref").Client} c 
     */
    constructor(c) {
        this.c = c;
    }

    async sendLogin(cmd, body) {
        const pkt = this._buildLoginPacket(cmd, this._buildOICQPacket(body), 2);
        try {
            const payload = await this.c.send(pkt);
            this._decodeLoginResponse(payload);
        } catch (e) {
            this.logger.debug(e.message);
            if (this.token_flag)
                await this.deleteToken();
            this.c.emit("internal.network", "服务器繁忙");
        }
    }

    /**
     * @this {import("../ref").Client}
     * @param {Buffer} data 
     */
    decodeT119(data, token = false) {
        const reader = Readable.from(tea.decrypt(data, this.device.tgtgt), { objectMode: false });
        reader.read(2);
        const t = readTlv(reader);
        this.readT106(token ? this.t106 : t[0x106]);
        this.readT11A(t[0x11a]);
        this.readT512(t[0x512]);
        this.sig = {
            srm_token: t[0x16a] ? t[0x16a] : this.sig.srm_token,
            tgt: t[0x10a] ? t[0x10a] : this.sig.tgt,
            tgt_key: t[0x10d] ? t[0x10d] : this.sig.tgt_key,
            st_key: t[0x10e] ? t[0x10e] : this.sig.st_key,
            st_web_sig: t[0x103] ? t[0x103] : this.sig.st_web_sig,
            skey: t[0x120] ? t[0x120] : this.sig.skey,
            d2: t[0x143] ? t[0x143] : this.sig.d2,
            d2key: t[0x305] ? t[0x305] : this.sig.d2key,
            sig_key: t[0x133] ? t[0x133] : this.sig.sig_key,
            ticket_key: t[0x134] ? t[0x134] : this.sig.ticket_key,
            device_token: t[0x322] ? t[0x322] : this.sig.device_token,
            emp_time: token ? 0 : timestamp(),
        };
        fs.writeFile(
            path.join(this.dir, "token"),
            Buffer.concat([
                this.sig.d2key,
                this.sig.d2,
                this.sig.ticket_key,
                this.sig.sig_key,
                this.sig.srm_token,
                this.sig.tgt,
                this.sig.device_token,
            ]),
            { mode: 0o600 },
            NOOP
        );
    }
    readT106(data) {
        if (!data) return;
        this.t106 = data;
        fs.writeFile(
            path.join(this.dir, "t106"),
            data,
            { mode: 0o600 },
            NOOP
        );
        if (!this.password_md5)
            return;
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(this.uin);
        const key = md5(Buffer.concat([
            this.password_md5, Buffer.alloc(4), buf
        ]));
        try {
            data = tea.decrypt(Buffer.concat([data]), key);
            this.device.tgtgt = data.slice(51, 67);
        } catch {
            this.logger.warn("你的密码不正确，虽然使用token可以登录，但无法刷新cookies");
        }
    }
    readT11A(data) {
        if (!data) return;
        const stream = Readable.from(data, { objectMode: false });
        stream.read(2);
        this.age = stream.read(1).readUInt8();
        this.sex = ["unknown", "male", "female"][stream.read(1).readUInt8()];
        const nickname = stream.read(stream.read(1).readUInt8() & 0xff);
        this.nickname = nickname ? String(nickname) : "";
    }
    readT512(data) {
        if (!data) return;
        const stream = Readable.from(data, { objectMode: false });
        let len = stream.read(2).readUInt16BE();
        while (len-- > 0) {
            const domain = String(stream.read(stream.read(2).readUInt16BE()));
            const pskey = stream.read(stream.read(2).readUInt16BE());
            const pt4token = stream.read(stream.read(2).readUInt16BE());
            this.cookies[domain] = pskey;
        }
    }

    _decodeLoginResponse(payload) {
        payload = tea.decrypt(payload.slice(16, payload.length - 1), this.ecdh.share_key);
        const stream = Readable.from(payload, { objectMode: false });
        stream.read(2);
        const type = stream.read(1).readUInt8();
        stream.read(2);
        const t = readTlv(stream);
    
        if (type === 204) {
            this.t104 = t[0x104];
            this.logger.mark("unlocking...");
            return this.deviceLogin();
        }
    
        if (type === 0) {
            this.t104 = undefined;
            this.t174 = undefined;
            this.phone = undefined;
            this.decodeT119(t[0x119], this.token_flag);
            return this.c.emit("internal.login");
        }
    
        if (this.token_flag) {
            this.logger.mark("token失效，重新login..");
            return this.deleteToken().then(this.passwordLogin.bind(this));
        }
    
        if (type === 2) {
            this.t104 = t[0x104];
            if (t[0x192]) {
                const url = String(t[0x192]);
                this.logger.mark(`收到滑动验证码，请访问以下地址完成滑动，并从网络响应中取出ticket输入：${url}`);
                return this.c.em("system.login.slider", { url });
            }
            const message = "[登陆失败]未知格式的验证码。";
            this.logger.error(message);
            return this.c.em("system.login.error", {
                code: 2, message
            });
        }
    
        if (type === 160 || type === 162) {
            if (!t[0x204])
                return;
            const url = String(t[0x204]).replace("verify", "qrcode");
            this.logger.mark("登录保护二维码验证地址：" + url);
            if (t[0x174] && t[0x178]) {
                this.t104 = t[0x104];
                this.t174 = t[0x174];
                this.phone = String(t[0x178]).substr(t[0x178].indexOf("\x0b") + 1, 11);
            }
            return this.c.em("system.login.device", { url, phone: this.phone });
        }

        if (t[0x149]) {
            const stream = Readable.from(t[0x149], { objectMode: false });
            stream.read(2);
            const title = stream.read(stream.read(2).readUInt16BE()).toString();
            const content = stream.read(stream.read(2).readUInt16BE()).toString();
            const message = `[${title}]${content}`;
            this.logger.error(message + "(错误码：" + type + ")");
            return this.c.em("system.login.error", { code: type, message });
        }
    
        if (t[0x146]) {
            const stream = Readable.from(t[0x146], { objectMode: false });
            const version = stream.read(4);
            const title = stream.read(stream.read(2).readUInt16BE()).toString();
            const content = stream.read(stream.read(2).readUInt16BE()).toString();
            const message = `[${title}]${content}`;
            this.logger.error(message + "(错误码：" + type + ")");
            return this.c.em("system.login.error", { code: type, message });
        }
    
        this.logger.error("[登陆失败]未知错误，错误码：" + type);
        this.c.em("system.login.error", {
            code: type,
            message: "[登陆失败]未知错误。"
        });
    }

    heartbeat() {
        const pkt = this._buildLoginPacket("Heartbeat.Alive", BUF0, 0);
        return this.c.send(pkt).catch(NOOP);
    }

    async register(logout = false) {
        const pb_buf = pb.encode({
            1: [
                { 1: 46, 2: timestamp() },
                { 1: 283, 2: 0 }
            ]
        });
        const d = this.device;
        const SvcReqRegister = jce.encodeStruct([
            this.uin,
            (logout ? 0 : 7), 0, "", (logout ? 21 : 11), 0, 0, 0, 0, 0, (logout ? 44 : 0),
            d.version.sdk, 1, "", 0, null, d.guid, 2052, 0, d.model, d.model,
            d.version.release, 1, 0, 0, null, 0, 0, "", 0, d.brand,
            d.brand, "", pb_buf, 0, null, 0, null, 1000, 98
        ]);
        const extra = {
            service: "PushService",
            method: "SvcReqRegister",
        };
        const body = jce.encodeWrapper({ SvcReqRegister }, extra);
        const pkt = this._buildLoginPacket("StatSvc.register", body, 1);
        try {
            const blob = await this.c.send(pkt);
            const rsp = jce.decode(blob);
            const result = rsp[9] ? true : false;
            if (!result && !logout)
                await this.deleteToken();
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @param {Buffer} body 
     * @returns {Buffer}
     */
    _buildOICQPacket(body, emp = false) {
        if (emp) {
            body = new Writer()
                .writeTlv(this.sig.sig_key)
                .writeBytes(tea.encrypt(body, this.sig.ticket_key))
                .read();
        } else {
            body = new Writer()
                .writeU8(0x02)
                .writeU8(0x01)
                .writeBytes(this.random_key)
                .writeU16(0x131)
                .writeU16(0x01)
                .writeTlv(this.ecdh.public_key)
                .writeBytes(tea.encrypt(body, this.ecdh.share_key))
                .read();
        }
        return new Writer()
            .writeU8(0x02)
            .writeU16(29 + body.length) // 1 + 27 + body.length + 1
            .writeU16(8001)             // protocol ver
            .writeU16(0x810)            // command id
            .writeU16(1)                // const
            .writeU32(this.uin)
            .writeU8(3)                 // const
            .writeU8(emp ? 69 : 0x87)   // encrypt type 7:0 69:emp 0x87:4
            .writeU8(0)                 // const
            .writeU32(2)                // const
            .writeU32(0)                // app client ver
            .writeU32(0)                // const
            .writeBytes(body)
            .writeU8(0x03)
            .read();
    }

    /**
     * @param {string} cmd 
     * @param {Buffer} body 
     * @param {0|1|2} type 0心跳 1上线 2登录
     * @returns {Buffer}
     */
    _buildLoginPacket(cmd, body, type) {
        this.c.nextSeq();
        this.logger.trace(`send:${cmd} seq:${this.seq_id}`);
        let sso = new Writer().writeU32(this.seq_id)
            .writeU32(this.apk.subid)
            .writeU32(this.apk.subid)
            .writeBytes(BUF_UNKNOWN)
            .writeWithLength(this.sig.tgt)
            .writeWithLength(cmd)
            .writeWithLength(this.session_id)
            .writeWithLength(this.device.imei)
            .writeU32(4)
            .writeU16(this.ksid.length + 2)
            .writeBytes(this.ksid)
            .writeU32(4)
            .read();
        sso = new Writer().writeWithLength(sso).writeWithLength(body).read();
        if (type === 1)
            sso = tea.encrypt(sso, this.sig.d2key);
        else if (type === 2)
            sso = tea.encrypt(sso, BUF16);
        body = new Writer()
            .writeU32(0x0A)
            .writeU8(type)
            .writeWithLength(this.sig.d2)
            .writeU8(0)
            .writeWithLength(String(this.uin))
            .writeBytes(sso)
            .read();
        return new Writer().writeWithLength(body).read();
    }

    deleteToken() {
        return fs.promises.unlink(path.join(this.dir, "token")).catch(NOOP);
    }

    async exchangeEmp() {
        if (!this.password_md5 || !this.c.isOnline() || timestamp() - this.sig.emp_time < 14400)
            return;
        const t = this.tlvPacker;
        const body = new Writer()
            .writeU16(15)
            .writeU16(24)
            .writeBytes(t(0x18))
            .writeBytes(t(0x1))
            .writeU16(0x106)
            .writeU16(this.t106.length)
            .writeBytes(this.t106)
            .writeBytes(t(0x116))
            .writeBytes(t(0x100, 1))
            .writeBytes(t(0x107))
            .writeBytes(t(0x144))
            .writeBytes(t(0x142))
            .writeBytes(t(0x145))
            .writeBytes(t(0x16a))
            .writeBytes(t(0x154))
            .writeBytes(t(0x141))
            .writeBytes(t(0x8))
            .writeBytes(t(0x511))
            .writeBytes(t(0x147))
            .writeBytes(t(0x177))
            .writeBytes(t(0x400))
            .writeBytes(t(0x187))
            .writeBytes(t(0x188))
            .writeBytes(t(0x194))
            .writeBytes(t(0x202))
            .writeBytes(t(0x516))
            .writeBytes(t(0x521))
            .writeBytes(t(0x525))
            .read();
        const pkt = this._buildOICQPacket(body, true);
        try {
            let payload = await this.c.sendUni("wtlogin.exchange_emp", pkt);
            payload = tea.decrypt(payload.slice(16, payload.length - 1), this.sig.ticket_key);
            const stream = Readable.from(payload, { objectMode: false });
            stream.read(5);
            const t = readTlv(stream);
            if (t[0x119]) {
                this.decodeT119(t[0x119]);
            } else {
                this.deleteToken()
                this.sig.emp_time = 0xffffffff;
                this.logger.warn("刷新cookies失败，可能是由于你切换过登录协议或其他原因所导致。如果你需要使用依赖cookies的功能建议立即重新登录。");
            }
        } catch (e) {
            this.logger.warn("刷新cookies失败。");
            this.logger.warn(e);
        }
    }
}

/**
 * @param {Readable} stream 
 * @returns {{[k: number]: Buffer}}
 */
function readTlv(stream) {
    const t = { };
    while (stream.readableLength > 2) {
        const k = stream.read(2).readUInt16BE();
        t[k] = stream.read(stream.read(2).readUInt16BE());
    }
    return t;
}

module.exports = {
    WtLogin, readTlv, BUF_UNKNOWN,
};

require("./login-password");
require("./login-qrcode");
