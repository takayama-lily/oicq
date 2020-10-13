"use strict";
const fs = require("fs");
const path = require("path");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const common = require("../common");
const jce = require("../jce");
const BUF0 = Buffer.alloc(0);
const BUF16 = Buffer.alloc(16);

/**
 * @param {Buffer} body 
 * @returns {Buffer}
 */
function commonOICQ(body) {
    body = new Writer()
        .writeU8(0x01)
        .writeU8(0x01)
        .writeBytes(this.random_key)
        .writeU16(258)
        .writeTlv(ecdh.public_key)
        .writeBytes(tea.encrypt(body, ecdh.share_key))
        .read();
    return new Writer()
        .writeU8(0x02)
        .writeU16(29 + body.length) // 1 + 27 + body.length + 1
        .writeU16(8001)             // protocol ver
        .writeU16(0x810)            // command id
        .writeU16(1)                // const
        .writeU32(this.uin)
        .writeU8(3)                 // const
        .writeU8(7)                 // encrypt type 7:0 0x87:4
        .writeU8(0)                 // const
        .writeU32(2)                // const
        .writeU32(0)                // app client ver
        .writeU32(0)                // const
        .writeBytes(body)
        .writeU8(0x03)
        .read();
}

/**
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {Buffer} ext 
 * @returns {Buffer}
 */
function commonSSO(cmd, body, ext = BUF0) {
    this.logger.trace(`send:${cmd} seq:${this.seq_id}`);
    const head = new Writer().writeU32(this.seq_id)
        .writeU32(this.sub_appid)
        .writeU32(this.sub_appid)
        .writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])) // unknown
        .writeWithLength(ext)
        .writeWithLength(cmd)
        .writeWithLength(this.session_id)
        .writeWithLength(this.device.imei)
        .writeU32(4)
        .writeU16(this.ksid.length + 2)
        .writeBytes(this.ksid)
        .writeU32(4)
        .read();
    return new Writer().writeWithLength(head).writeWithLength(body).read();
}

/**
 * @param {Number} uin UInt32
 * @param {Number} type UInt8
 * @param {Buffer} key 
 * @param {Buffer} body 
 * @param {Buffer} ext 
 * @returns {Buffer}
 */
function commonLogin(uin, type, key, body, ext = BUF0) {
    body = new Writer()
        .writeU32(0x0A)
        .writeU8(type)
        .writeWithLength(ext)
        .writeU8(0)
        .writeWithLength(uin.toString())
        .writeBytes(key.length ? tea.encrypt(body, key) : body)
        .read();
    return new Writer().writeWithLength(body).read();
}

/**
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {Number} seq 
 * @returns {Buffer}
 */
function buildUNIPacket(cmd, body, seq = 0) {
    seq = seq ? seq : this.seq_id;
    this.logger.trace(`send:${cmd} seq:${seq}`);
    this.send_timestamp = Date.now();
    let uni = new Writer()
        .writeWithLength(cmd)
        .writeWithLength(this.session_id)
        .writeWithLength(BUF0)
        .read();
    uni = new Writer().writeWithLength(uni).writeWithLength(body).read();
    uni = new Writer()
        .writeU32(0x0B)
        .writeU8(1) // body type
        .writeU32(seq)
        .writeU8(0)
        .writeWithLength(this.uin.toString())
        .writeBytes(tea.encrypt(uni, this.sig.d2key))
        .read();
    return new Writer().writeWithLength(uni).read();
}

//login req----------------------------------------------------------------------------------------

async function passwordLogin() {
    this.nextSeq();
    const t = tlv(this);
    const body = new Writer()
        .writeU16(9)
        .writeU16(23)
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
        .writeBytes(t(0x194))
        // .writeBytes(t(0x191)) // slider switch
        .writeBytes(t(0x202))
        .writeBytes(t(0x177))
        .writeBytes(t(0x516))
        .writeBytes(t(0x521))
        .writeBytes(t(0x525))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        var blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
    } catch (e) {
        this.logger.error("未收到login响应包。");
        this.terminate();
        return common.emit(this, "system.offline.network");
    }
    decodeLoginResponse.call(this, blob);
}

/**
 * @param {String} captcha Buffer length must be 4
 */
async function captchaLogin(captcha) {
    captcha = String(captcha).trim();
    if (Buffer.byteLength(captcha) !== 4)
        captcha = "abcd";
    this.nextSeq();
    const t = tlv(this);
    const body = new Writer()
        .writeU16(2)
        .writeU16(4)
        .writeBytes(t(0x2, captcha))
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        var blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
    } catch (e) {
        this.logger.error("未收到login响应包。");
        this.terminate();
        return common.emit(this, "system.offline.network");
    }
    decodeLoginResponse.call(this, blob);
}

async function deviceLogin() {
    this.nextSeq();
    const t = tlv(this);
    const body = new Writer()
        .writeU16(20)
        .writeU16(4)
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .writeBytes(t(0x401))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        var blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
    } catch (e) {
        this.logger.error("未收到login响应包。");
        this.terminate();
        return common.emit(this, "system.offline.network");
    }
    decodeLoginResponse.call(this, blob);
}
async function heartbeat() {
    this.nextSeq();
    const sso = commonSSO.call(this, "Heartbeat.Alive", BUF0);
    await this.send(commonLogin(this.uin, 0, BUF0, sso));
}

//----------------------------------------------------------------------------------------------

async function register() {
    this.nextSeq();
    const pb_buf = Buffer.from([0x0A, 0x04, 0x08, 0x2E, 0x10, 0x00, 0x0A, 0x05, 0x08, 0x9B, 0x02, 0x10, 0x00]);
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        7, 0, "", 11, 0, 0, 0, 0, 0, 0,
        this.device.version.sdk, 1, "", 0, null, this.device.guid, 2052, 0, this.device.model, this.device.model,
        this.device.version.release, 1, 0, 0, null, 0, 0, "", 0, this.device.brand,
        this.device.brand, "", pb_buf, 0, null, 0, null, 1000
    ]);
    const extra = {
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const sso = commonSSO.call(this, "StatSvc.register", body, this.sig.tgt);
    const blob = await this.send(commonLogin(this.uin, 1, this.sig.d2key, sso, this.sig.d2));
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

// function decodeT161(data) {
//     const stream = Readable.from(data, {objectMode:false});
//     stream.read(2);
//     this.rollback_sig = readTlv(stream, 2)[0x172];
// }
function decodeT119(data) {
    const reader = Readable.from(tea.decrypt(data, this.device.tgtgt), {objectMode:false});
    reader.read(2);
    const t = readTlv(reader, 2);
    // if (t[0x130])
    //     decodeT130.call(this, t[0x130]);
    // this.t528 = t[0x528];
    // this.t530 = t[0x530];
    this.ksid = t[0x108];
    // if (t[0x186])
    //     decodeT186.call(this, t[0x186]);
    if (t[0x11a])
        [this.nickname, this.age, this.sex] = readT11A(t[0x11a]);
    this.sig = {
        tgt:            t[0x10a],
        tgt_key:        t[0x10d],
        st_key:         t[0x10e],
        st_web_sig:     t[0x103],
        s_key:          t[0x120],
        d2:             t[0x143],
        d2key:          t[0x305],
        sig_key:        t[0x133],
        ticket_key:     t[0x134],
        device_token:   t[0x322],
    };
}
// function decodeT130(data) {
//     const stream = Readable.from(data, {objectMode:false});
//     stream.read(2);
//     this.time_diff = stream.read(4).readInt32BE() - common.timestamp();
//     this.t149 = stream.read(4);
// }
// function decodeT186(data) {
//     this.pwd_flag = data[1] === 1;
// }
function readT11A(data) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    const age = stream.read(1).readUInt8();
    const sex = ["unknown","male","female"][stream.read(1).readUInt8()];
    let nickname = stream.read(stream.read(1).readUInt8() & 0xff);
    nickname = nickname ? nickname.toString() : "";
    return [nickname, age, sex];
}

//login rsp----------------------------------------------------------------------------------------------

/**
 * 0 success
 * 1 wrong password
 * 2 captcha
 * 3 ??
 * 6,8,9 其他错误
 * 40 frozen
 * 160 短信验证解锁设备
 * 162 短信验证失败
 * 167 请使用QQ一键登录
 * 204 need unlock device
 * 235 当前版本过低
 * 237 环境异常
 * 239 异地登陆短信验证
 */
function decodeLoginResponse(blob) {
    const stream = Readable.from(blob, {objectMode:false});
    stream.read(2);
    const type = stream.read(1).readUInt8();
    stream.read(2);
    const t = readTlv(stream, 2);
    if (type === 0) {
        // this.t150 = t[0x150];
        // if (t[0x161])
        //     decodeT161.call(this, t[0x161]);
        decodeT119.call(this, t[0x119]);
        return common.emit(this, "internal.login");
    }
    if (type === 2) {
        this.t104 = t[0x104]
        if (t[0x192]) {
            this.logger.error("收到滑动验证码，暂不支持。");
            return common.emit(this, "system.login.error", {
                code: 2,
                message: `[登陆失败]暂不支持滑动验证码。`
            });
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
            return common.emit(this, "system.login.captcha", {image});
        }
        this.logger.error("收到未知格式的验证码，暂不支持。");
        return common.emit(this, "system.login.error", {
            code: 2,
            message: `[登陆失败]未知格式的验证码。`
        });
    }

    if (type === 160) {
        const url = String(t[0x204]);
        this.logger.info("需要扫码验证设备信息，验证地址：" + url);
        return common.emit(this, "system.login.device", {url});
    }

    if (type === 204) {
        this.t104 = t[0x104];
        this.logger.info("login...");
        return deviceLogin.call(this);
    }

    if (t[0x149]) {
        const stream = Readable.from(t[0x149], {objectMode:false});
        stream.read(2);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return common.emit(this, "system.login.error", {code: type, message});
    }

    if (t[0x146]) {
        const stream = Readable.from(t[0x146], {objectMode:false});
        const version = stream.read(4); //?
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return common.emit(this, "system.login.error", {code: type, message});
    }

    this.logger.error("[登陆失败]未知错误。");
    common.emit(this, "system.login.error", {
        code: type,
        message: `[登陆失败]未知错误。`
    });
}

module.exports = {
    passwordLogin, captchaLogin, heartbeat, register, buildUNIPacket
};
