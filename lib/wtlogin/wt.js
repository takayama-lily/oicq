"use strict";
const fs = require("fs");
const path = require("path");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const {timestamp, md5} = require("../common");
const jce = require("../jce");
const pb = require("../pb");

function encryptOICQBody(body) {
    return new Writer()
        .writeU8(0x02)
        .writeU8(0x01)
        .writeBytes(this.random_key)
        .writeU16(0x131)
        .writeU16(0x01)
        .writeTlv(ecdh.public_key)
        .writeBytes(tea.encrypt(body, ecdh.share_key))
        .read();
}

function encryptEMPBody(body) {
    return new Writer()
        .writeTlv(this.sig.sig_key)
        .writeBytes(tea.encrypt(body, this.sig.ticket_key))
        .read();
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer} body 
 * @param {Boolean} emp 
 * @returns {Buffer}
 */
function buildOICQPacket(body, emp = false) {
    body = (emp?encryptEMPBody:encryptOICQBody).call(this, body);
    return new Writer()
        .writeU8(0x02)
        .writeU16(29 + body.length) // 1 + 27 + body.length + 1
        .writeU16(8001)             // protocol ver
        .writeU16(0x810)            // command id
        .writeU16(1)                // const
        .writeU32(this.uin)
        .writeU8(3)                 // const
        .writeU8(emp?69:0x87)          // encrypt type 7:0 69:emp 0x87:4
        .writeU8(0)                 // const
        .writeU32(2)                // const
        .writeU32(0)                // app client ver
        .writeU32(0)                // const
        .writeBytes(body)
        .writeU8(0x03)
        .read();
}

/**
 * @this {import("../ref").Client}
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {0|1|2} type 
 * @returns {Buffer}
 */
function build0x0APacket(cmd, body, type) {
    this.logger.trace(`send:${cmd} seq:${this.seq_id}`);
    let sso = new Writer().writeU32(this.seq_id)
        .writeU32(this.apk.subid)
        .writeU32(this.apk.subid)
        .writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])) // unknown
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
        sso = tea.encrypt(sso, Buffer.alloc(16));
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

/**
 * @this {import("../ref").Client}
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {Number} seq 
 * @returns {Buffer}
 */
function build0x0BPacket(cmd, body, seq = 0) {
    seq = seq ? seq : this.nextSeq();
    this.logger.trace(`send:${cmd} seq:${seq}`);
    this.send_timestamp = Date.now();
    const type = cmd==="wtlogin.exchange_emp"?2:1;
    let sso = new Writer()
        .writeWithLength(cmd)
        .writeWithLength(this.session_id)
        .writeU32(4)
        .read();
    if (cmd.startsWith("OidbSvc."))
        body = pb.encodeOIDB.call(this, cmd, body);
    sso = new Writer().writeWithLength(sso).writeWithLength(body).read();
    body = new Writer()
        .writeU32(0x0B)
        .writeU8(type)
        .write32(seq)
        .writeU8(0)
        .writeWithLength(this.uin.toString())
        .writeBytes(tea.encrypt(sso, type===1?this.sig.d2key:Buffer.alloc(16)))
        .read();
    return new Writer().writeWithLength(body).read();
}

//login req----------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 */
async function passwordLogin(slider = true) {
    try {
        const token = await fs.promises.readFile(path.join(this.dir, "token"));
        const d2key = token.slice(0, 16);
        const d2 = token.slice(16, 80);
        const ticket = token.slice(80, 96);
        const sig = token.slice(96, 144);
        const srm = token.slice(144, 200);
        const tgt = token.slice(200, 272);
        this.sig.device_token = token.slice(272);
        if (d2key.length && d2.length && ticket.length && sig.length && srm.length && tgt.length) {
            this.sig.ticket_key = ticket;
            this.sig.sig_key = sig;
            this.sig.srm_token = srm;
            this.sig.tgt = tgt;
            this.device.tgtgt = md5(d2key);
            return tokenLogin.call(this, d2);
        }
    } catch {}
    this.logining = true;
    this.nextSeq();
    const t = tlv.getPacker(this);
    let body = new Writer()
        .writeU16(9)
        .writeU16(slider?24:23)
        .writeBytes(t(0x18))
        .writeBytes(t(0x1))
        .writeBytes(t(0x106))
        .writeBytes(t(0x116))
        .writeBytes(t(0x100))
        .writeBytes(t(0x107))
        .writeBytes(t(0x108))
        .writeBytes(t(0x142))
        .writeBytes(t(0x144))
        .writeBytes(t(0x145))
        .writeBytes(t(0x147))
        .writeBytes(t(0x154))
        .writeBytes(t(0x141))
        .writeBytes(t(0x8))
        .writeBytes(t(0x511))
        .writeBytes(t(0x187))
        .writeBytes(t(0x188))
        .writeBytes(t(0x194));
    if (slider)
        body = body.writeBytes(t(0x191));
    body = body.writeBytes(t(0x202))
        .writeBytes(t(0x177))
        .writeBytes(t(0x516))
        .writeBytes(t(0x521))
        .writeBytes(t(0x525))
        .read();
    const pkt = build0x0APacket.call(this, "wtlogin.login", buildOICQPacket.call(this, body), 2);
    try {
        var blob = await this.send(pkt);
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        // this.logger.error(e);
        return this.emit("internal.wt.failed", "未收到passwordLogin响应包或发生严重错误。");
    }
}

/**
 * @this {import("../ref").Client}
 * @param {String} captcha Buffer length must be 4
 */
async function captchaLogin(captcha) {
    this.logining = true;
    captcha = String(captcha).trim();
    if (Buffer.byteLength(captcha) !== 4)
        captcha = "abcd";
    this.nextSeq();
    const t = tlv.getPacker(this);
    const body = new Writer()
        .writeU16(2)
        .writeU16(4)
        .writeBytes(t(0x2, captcha))
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .read();
    const pkt = build0x0APacket.call(this, "wtlogin.login", buildOICQPacket.call(this, body), 2);
    this.captcha_sign = undefined;
    try {
        var blob = await this.send(pkt);
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        // this.logger.error(e);
        return this.emit("internal.wt.failed", "未收到captchaLogin响应包或发生严重错误。");
    }
}

/**
 * @this {import("../ref").Client}
 * @param {String} ticket
 */
async function sliderLogin(ticket) {
    this.logining = true;
    ticket = String(ticket).trim();
    this.nextSeq();
    const t = tlv.getPacker(this);
    const body = new Writer()
        .writeU16(2)
        .writeU16(4)
        .writeBytes(t(0x193, ticket))
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .read();
    const pkt = build0x0APacket.call(this, "wtlogin.login", buildOICQPacket.call(this, body), 2);
    try {
        var blob = await this.send(pkt);
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        return this.emit("internal.wt.failed", "未收到sliderLogin响应包或发生严重错误。");
    }
}

/**
 * @this {import("../ref").Client}
 */
async function deviceLogin() {
    this.nextSeq();
    const t = tlv.getPacker(this);
    const body = new Writer()
        .writeU16(20)
        .writeU16(4)
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .writeBytes(t(0x401))
        .read();
    const pkt = build0x0APacket.call(this, "wtlogin.login", buildOICQPacket.call(this, body), 2);
    try {
        var blob = await this.send(pkt);
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        // this.logger.error(e);
        return this.emit("internal.wt.failed", "未收到deviceLogin响应包或发生严重错误。");
    }
}

/**
 * @this {import("../ref").Client}
 */
async function heartbeat() {
    this.nextSeq();
    const pkt = build0x0APacket.call(this, "Heartbeat.Alive", Buffer.alloc(0), 0);
    await this.send(pkt);
}

/**
 * @this {import("../ref").Client}
 */
async function exchangeEMP() {
    if (!this.isOnline() || timestamp() - this.sig.emp_time < 14400)
        return;
    this.nextSeq();
    const t = tlv.getPacker(this);
    const body = new Writer()
        .writeU16(15)
        .writeU16(21)
        .writeBytes(t(0x18))
        .writeBytes(t(0x1))
        .writeBytes(t(0x106, 1))
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
        .writeBytes(t(0x187))
        .writeBytes(t(0x188))
        .writeBytes(t(0x194))
        .writeBytes(t(0x202))
        .writeBytes(t(0x516))
        .read();
    const pkt = build0x0BPacket.call(this, "wtlogin.exchange_emp", buildOICQPacket.call(this, body, true));
    try {
        let blob = await this.send(pkt);
        blob = tea.decrypt(blob.slice(16, blob.length-1), this.sig.ticket_key);
        const stream = Readable.from(blob, {objectMode: false});
        stream.read(5);
        const t = readTlv(stream, 2);
        if (t[0x119])
            decodeT119.call(this, t[0x119]);
        else
            this.logger.debug("emp失败");
    } catch {}
}

/**
 * @this {import("../ref").Client}
 */
async function tokenLogin(d2) {
    this.nextSeq();
    const t = tlv.getPacker(this);
    const body = new Writer()
        .writeU16(11)
        .writeU16(16)
        .writeBytes(t(0x100))
        .writeBytes(t(0x10a))
        .writeBytes(t(0x116))
        .writeBytes(t(0x144))
        .writeBytes(t(0x143, d2))
        .writeBytes(t(0x142))
        .writeBytes(t(0x154))
        .writeBytes(t(0x18))
        .writeBytes(t(0x141))
        .writeBytes(t(0x8))
        .writeBytes(t(0x147))
        .writeBytes(t(0x177))
        .writeBytes(t(0x187))
        .writeBytes(t(0x188))
        .writeBytes(t(0x202))
        .writeBytes(t(0x511))
        .read();
    const pkt = build0x0APacket.call(this, "wtlogin.exchange_emp", buildOICQPacket.call(this, body), 2);
    try {
        let blob = await this.send(pkt);
        decodeLoginResponse.call(this, blob, true);
    } catch {
        return this.emit("internal.wt.failed", "未收到tokenLogin响应包或发生严重错误。");
    }
}

//----------------------------------------------------------------------------------------------

// /**
//  * @this {import("../ref").Client}
//  */
// async function httpServerListReq() {
//     this.nextSeq();
//     const HttpServerListReq = jce.encodeStruct([
//         null, 1
//     ]);
//     const extra = {
//         service: "HttpServerListReq",
//         method:  "HttpServerListReq",
//     };
//     const body = jce.encodeWrapper({HttpServerListReq}, extra);
//     const pkt = build0x0APacket.call(this, "HttpServerListReq", body, 2);
//     const blob = await this.send(pkt);
//     require("../common").log(blob.toString("hex").replace(/(.)(.)/g, '$1$2 '));
// }

/**
 * @this {import("../ref").Client}
 */
async function register(logout = false) {
    this.nextSeq();
    const pb_buf = pb.encode({
        1: [{1:46, 2:timestamp()}, {1:283, 2:0}]
    });
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        logout?0:7, 0, "", logout?21:11, 0, 0, 0, 0, 0, logout?44:0,
        this.device.version.sdk, 1, "", 0, null, this.device.guid, 2052, 0, this.device.model, this.device.model,
        this.device.version.release, 1, 0, 0, null, 0, 0, "", 0, this.device.brand,
        this.device.brand, "", pb_buf, 0, null, 0, null, 1000, 98
    ]);
    const extra = {
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const pkt = build0x0APacket.call(this, "StatSvc.register", body, 1);
    const blob = await this.send(pkt);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[9]?true:false;
}

//decode tlv----------------------------------------------------------------------------------------------

/**
 * @param {Readable} stream 
 * @param {Number} size 
 * @returns {Object}
 */
function readTlv(stream, size) {
    const t = {};
    var k;
    while(true) {
        if (stream.readableLength < size)
            break;
        if (size === 1)
            k = stream.read(1).readUInt8();
        else if (size === 2)
            k = stream.read(2).readUInt16BE();
        else if (size === 4)
            k = stream.read(4).readInt32BE();
        if (k === 255)
            break;
        t[k] = stream.read(stream.read(2).readUInt16BE())
    }
    return t;
}

function decodeT119(data, token = false) {
    const reader = Readable.from(tea.decrypt(data, this.device.tgtgt), {objectMode:false});
    reader.read(2);
    const t = readTlv(reader, 2);
    readT11A.call(this, t[0x11a]);
    readT512.call(this, t[0x512]);
    this.sig = {
        srm_token:      t[0x16a]?t[0x16a]:this.sig.srm_token,
        tgt:            t[0x10a]?t[0x10a]:this.sig.tgt,
        tgt_key:        t[0x10d]?t[0x10d]:this.sig.tgt_key,
        st_key:         t[0x10e]?t[0x10e]:this.sig.st_key,
        st_web_sig:     t[0x103]?t[0x103]:this.sig.st_web_sig,
        skey:           t[0x120]?t[0x120]:this.sig.skey,
        d2:             t[0x143]?t[0x143]:this.sig.d2,
        d2key:          t[0x305]?t[0x305]:this.sig.d2key,
        sig_key:        t[0x133]?t[0x133]:this.sig.sig_key,
        ticket_key:     t[0x134]?t[0x134]:this.sig.ticket_key,
        device_token:   t[0x322]?t[0x322]:this.sig.device_token,
        emp_time:       token ? 0 : timestamp(),
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
        ()=>{}
    );
}

function readT11A(data) {
    if (!data) return;
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    this.age = stream.read(1).readUInt8();
    this.sex = ["unknown","male","female"][stream.read(1).readUInt8()];
    this.nickname = stream.read(stream.read(1).readUInt8() & 0xff);
    this.nickname = this.nickname ? String(this.nickname) : "";
}
function readT512(data) {
    if (!data) return;
    const stream = Readable.from(data, {objectMode:false});
    let len = stream.read(2).readUInt16BE();
    while (len-- > 0) {
        const domain = String(stream.read(stream.read(2).readUInt16BE()));
        const pskey = stream.read(stream.read(2).readUInt16BE());
        const pt4token = stream.read(stream.read(2).readUInt16BE());
        this.cookies[domain] = pskey;
    }
}

//login rsp----------------------------------------------------------------------------------------------

/**
 * 0 success
 * 1 wrong password
 * 2 captcha
 * 3 ??
 * 6,8,9 其他错误
 * 7 安全风险
 * 15,16 你的用户身份已失效，为保证帐号安全，请你重新登录。
 * 40 frozen
 * 139 ??????
 * 160 短信验证解锁设备
 * 162 短信验证失败
 * 167 请使用QQ一键登录
 * 192 ??????
 * 204 need unlock device
 * 235 当前版本过低
 * 237 环境异常
 * 239 异地登陆短信验证
 * 
 * @this {import("../ref").Client}
 */
function decodeLoginResponse(blob, token = false) {
    blob = tea.decrypt(blob.slice(16, blob.length-1), ecdh.share_key);
    const stream = Readable.from(blob, {objectMode:false});
    stream.read(2);
    const type = stream.read(1).readUInt8();
    stream.read(2);
    const t = readTlv(stream, 2);

    if (type === 204) {
        this.t104 = t[0x104];
        this.t402 = t[0x402];
        this.t403 = t[0x403];
        this.logger.info("login...");
        return deviceLogin.call(this);
    }

    this.logining = false;

    if (type === 0) {
        decodeT119.call(this, t[0x119], token);
        return this.emit("internal.login");
    }

    if (token) {
        this.logining = true;
        this.logger.info("token失效，重新login..");
        return fs.unlink(path.join(this.dir, "token"), passwordLogin.bind(this));
    }

    if (type === 2) {
        this.t104 = t[0x104];
        if (t[0x192]) {
            if (this.config.slider) {
                const url = String(t[0x192]);
                this.logger.info(`收到滑动验证码，请访问以下地址完成滑动：${url}
！！！注意：请提前打开浏览器F12->Network(网络)，从滑动的返回结果中取出ticket并输入 (成功率非100%，若提示环境异常请再试一次)`);
                return this.em("system.login.slider", {url});
            } else {
                return passwordLogin.call(this, false);
            }
        }
        if (t[0x165]) {
            const stream = Readable.from(t[0x105], {objectMode:false});
            const signLen = stream.read(2).readUInt16BE();
            stream.read(2);
            this.captcha_sign = stream.read(signLen);
            const image = stream.read();
            const filepath = path.join(this.dir, `captcha.jpg`);
            fs.writeFileSync(filepath, image);
            this.logger.info(`收到图片验证码，已保存到文件(${filepath})，请查看并输入: `);
            return this.em("system.login.captcha", {image});
        }
        const message = "[登陆失败]未知格式的验证码。";
        this.logger.error(message);
        return this.em("system.login.error", {
            code: 2, message
        });
    }

    if (type === 160) {
        const url = String(t[0x204]);
        this.logger.info("需要扫码验证设备信息，验证地址：" + url);
        this.logger.debug("验证完毕后重新调用login()即可成功登陆。");
        return this.em("system.login.device", {url});
    }

    if (t[0x149]) {
        const stream = Readable.from(t[0x149], {objectMode:false});
        stream.read(2);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return this.em("system.login.error", {code: type, message});
    }

    if (t[0x146]) {
        const stream = Readable.from(t[0x146], {objectMode:false});
        const version = stream.read(4); //?
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return this.em("system.login.error", {code: type, message});
    }

    this.logger.error("[登陆失败]未知错误。");
    this.em("system.login.error", {
        code: type,
        message: `[登陆失败]未知错误。`
    });
}

module.exports = {
    passwordLogin, captchaLogin, sliderLogin, heartbeat, register, build0x0BPacket, exchangeEMP
};
