"use strict";
const fs = require("fs");
const path = require("path");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const common = require("../common");
const pb = require("../pb");
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
        .writeU8(7)                 // encrypt id of secp192k1
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
    const head = (()=>{
        const stream = new Writer();
        stream.writeU32(this.seq_id)
            .writeU32(this.sub_appid)
            .writeU32(this.sub_appid)
            .writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])); // unknown
        if (!ext.length || ext.length === 4) stream.writeU32(0x04);
        else stream.writeWithLength(ext);
        return stream.writeWithLength(cmd)
            .writeU32(8)
            .writeBytes(this.session_id)
            .writeWithLength(this.device_info.imei)
            .writeU32(4)
            .writeU16(this.ksid.length + 2)
            .writeBytes(this.ksid)
            .writeU32(4)
            .read();
    })();
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
        .writeU32(0x00_00_00_0A)
        .writeU8(type)
        .writeWithLength(ext)
        .writeU8(0x00)
        .writeWithLength(uin.toString())
        .writeBytes(key.length ? tea.encrypt(body, key) : body)
        .read();
    return new Writer().writeWithLength(body).read();
}

/**
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {Buffer} ext 
 * @returns {Buffer}
 */
function buildUNIPacket(cmd, body, ext = BUF0) {
    this.logger.trace(`send:${cmd} seq:${this.seq_id}`);
    this.send_timestamp = Date.now();
    let uni = new Writer()
        .writeWithLength(cmd)
        .writeU32(8)
        .writeBytes(this.session_id)
        .writeWithLength(ext)
        .read();
    uni = new Writer().writeWithLength(uni).writeWithLength(body).read();
    uni = new Writer()
        .writeU32(0x0B)
        .writeU8(1) // body type
        .writeU32(this.seq_id)
        .writeU8(0)
        .writeWithLength(this.uin.toString())
        .writeBytes(tea.encrypt(uni, this.sign_info.d2key))
        .read();
    return new Writer().writeWithLength(uni).read();
}

//login req----------------------------------------------------------------------------------------

async function passwordLogin() {
    this.nextSeq();
    const d = this.device_info;
    const device_buf = pb.encode("DeviceInfo", {
        bootloader: d.bootloader,
        procVersion: d.proc_version,
        codename: d.version.codename,
        incremental: d.version.incremental,
        fingerprint: d.fingerprint,
        bootId: d.boot_id,
        androidId: d.android_id,
        baseBand: d.baseband,
        innerVersion: d.version.incremental,
    });
    const body = new Writer()
        .writeU16(9)    // cmd
        .writeU16(17)   // tlv cnt
        .writeBytes(tlv[0x018](16, this.uin))
        .writeBytes(tlv[0x001](this.uin, d.ip_address))
        .writeBytes(tlv[0x106](16, this.sub_appid, this.uin, 0, this.password_md5, true, d.guid, d.tgtgt_key))
        .writeBytes(tlv[0x116](184024956, 0x10400))
        .writeBytes(tlv[0x100](16, this.sub_appid))
        .writeBytes(tlv[0x107](0))
        .writeBytes(tlv[0x142]("com.tencent.mobileqq"))
        .writeBytes(tlv[0x144](
            d.android_id, device_buf,
            d.os_type, d.version.release, d.sim_info, d.apn,
            false, true, false, 16777216,
            d.model, d.guid, d.brand, d.tgtgt_key,
        ))
        .writeBytes(tlv[0x145](d.guid))
        .writeBytes(tlv[0x147](16, Buffer.from("8.2.7"), Buffer.from([0xA6, 0xB7, 0x45, 0xBF, 0x24, 0xA2, 0xC2, 0x77, 0x52, 0x77, 0x16, 0xF6, 0xF3, 0x6E, 0xB6, 0x8D])))
        .writeBytes(tlv[0x154](this.seq_id))
        .writeBytes(tlv[0x141](d.sim_info, d.apn))
        .writeBytes(tlv[0x008](2052))
        .writeBytes(tlv[0x511]([
            "tenpay.com", "openmobile.qq.com", "docs.qq.com", "connect.qq.com",
            "qzone.qq.com", "vip.qq.com", "qun.qq.com", "game.qq.com", "qqweb.qq.com",
            "office.qq.com", "ti.qq.com", "mail.qq.com", "qzone.com", "mma.qq.com",
        ]))
        .writeBytes(tlv[0x187](d.mac_address))
        .writeBytes(tlv[0x188](d.android_id))
        .writeBytes(tlv[0x194](d.imsi_md5))
        .writeBytes(tlv[0x191]())
        .writeBytes(tlv[0x202](d.wifi_bssid, d.wifi_ssid))
        .writeBytes(tlv[0x177]())
        .writeBytes(tlv[0x516]())
        .writeBytes(tlv[0x521]())
        .writeBytes(tlv[0x525](tlv[0x536](Buffer.from([0x1, 0x0]))))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        const blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        this.logger.debug("系统发生严重错误。");
        this.logger.debug(e);
    }
}

/**
 * @param {String} captcha Buffer length must be 4
 */
async function captchaLogin(captcha) {
    captcha = String(captcha).trim();
    if (Buffer.byteLength(captcha) !== 4)
        captcha = "abcd";
    this.nextSeq();
    const body = new Writer()
        .writeU16(2)    // cmd
        .writeU16(4)    // tlv cnt
        .writeBytes(tlv[0x2](captcha, this.captcha_sign))
        .writeBytes(tlv[0x8](2052))
        .writeBytes(tlv[0x104](this.t104))
        .writeBytes(tlv[0x116](150470524, 66560))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        const blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        this.logger.debug("系统发生严重错误。");
        this.logger.debug(e);
    }
}
/**
 * @param {Buffer} t402 
 */
async function deviceLogin(t402) {
    this.nextSeq();
    const body = new Writer()
        .writeU16(20)   // cmd
        .writeU16(4)    // tlv cnt
        .writeBytes(tlv[0x8](2052))
        .writeBytes(tlv[0x104](this.t104))
        .writeBytes(tlv[0x116](150470524, 66560))
        .writeBytes(tlv[0x401](common.md5(Buffer.concat([
            this.device_info.guid, Buffer.from("stMNokHgxZUGhsYp"), t402
        ]))))
        .read();
    const sso = commonSSO.call(this, "wtlogin.login", commonOICQ.call(this, body));
    try {
        const blob = await this.send(commonLogin(this.uin, 2, BUF16, sso));
        decodeLoginResponse.call(this, blob);
    } catch (e) {
        this.logger.debug("系统发生严重错误。");
        this.logger.debug(e);
    }
}
async function heartbeat() {
    this.nextSeq();
    const sso = commonSSO.call(this, "Heartbeat.Alive", BUF0);
    await this.send(commonLogin(this.uin, 0, BUF0, sso));
}

//----------------------------------------------------------------------------------------------

async function register() {
    this.nextSeq();
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        7, 0, "", 11, 0, 0, 0, 0, 0, 0,
        this.device_info.version.sdk, 1, "", 0, BUF0, this.device_info.guid, 2052, 0, this.device_info.model, this.device_info.model,
        this.device_info.version.release, 1, 1551, 0, null, 0, 31806887127679168n, "", 0, "MIUI",
        "ONEPLUS A5000_23_17", "", Buffer.from([0x0A, 0x04, 0x08, 0x2E, 0x10, 0x00, 0x0A, 0x05, 0x08, 0x9B, 0x02, 0x10, 0x00]), 0, BUF0, 0
    ]);
    const extra = {
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const sso = commonSSO.call(this, "StatSvc.register", body, this.sign_info.tgt);
    const blob = await this.send(commonLogin(this.uin, 1, this.sign_info.d2key, sso, this.sign_info.d2));
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

function decodeT161(data) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    this.rollback_sig = readTlv(stream, 2)[0x172];
}
function decodeT119(data) {
    const reader = Readable.from(tea.decrypt(data, this.device_info.tgtgt_key), {objectMode:false});
    reader.read(2);
    const t = readTlv(reader, 2);
    if (t[0x130])
        decodeT130.call(this, t[0x130]);
    this.t528 = t[0x528];
    this.t530 = t[0x530];
    this.ksid = t[0x108];
    if (t[0x186])
        decodeT186.call(this, t[0x186]);
    if (t[0x11a])
        [this.nickname, this.age, this.sex] = readT11A(t[0x11a]);
    this.sign_info = {
        bitmap:         0,
        tgt:            t[0x10a],
        tgt_key:        t[0x10d],
        st_key:         t[0x10e],
        st_web_sig:     t[0x103],
        s_key:          t[0x120],
        d2:             t[0x143],
        d2key:          t[0x305],
        ticket_key:     t[0x134],
        device_token:   t[0x322],
    };
}
function decodeT130(data) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    this.time_diff = stream.read(4).readInt32BE() - common.timestamp();
    this.t149 = stream.read(4);
}
function decodeT186(data) {
    this.pwd_flag = data[1] === 1;
}
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
 * @returns {void}
 */
function decodeLoginResponse(blob) {
    const stream = Readable.from(blob, {objectMode:false});
    stream.read(2);
    const type = stream.read(1).readUInt8();
    stream.read(2);
    const t = readTlv(stream, 2);
    if (type === 0) { //success
        this.t150 = t[0x150];
        if (t[0x161])
            decodeT161.call(this, t[0x161]);
        decodeT119.call(this, t[0x119]);
        return common.emit(this, "internal.login");
    }
    if (type === 2) { //captcha
        this.t104 = t[0x104]
        if (t[0x192]) { //slider captcha, not supported yet
            this.logger.error("收到滑动验证码，暂不支持。");
            return common.emit(this, "system.login.error", {
                message: `[登陆失败]暂不支持滑动验证码。`
            });
        }
        if (t[0x165]) { //image captcha
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
            message: `[登陆失败]未知格式的验证码。`
        });
    }

    if (type === 160) {
        const url = t[0x204].toString();
        this.logger.info("需要验证设备信息，验证地址：" + url);
        return common.emit(this, "system.login.device", {url});
    }

    if (type === 204) {
        this.t104 = t[0x104];
        this.logger.info("login...");
        return deviceLogin.call(this, t[0x402]);
    }

    if (t[0x149]) {
        const stream = Readable.from(t[0x149], {objectMode:false});
        stream.read(2);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return common.emit(this, "system.login.error", {message});
    }

    if (t[0x146]) {
        const stream = Readable.from(t[0x146], {objectMode:false});
        const version = stream.read(4); //?
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.logger.error(message);
        return common.emit(this, "system.login.error", {message});
    }

    this.logger.error("[登陆失败]未知错误。");
    common.emit(this, "system.login.error", {
        message: `[登陆失败]未知错误。`
    });
}

module.exports = {
    passwordLogin, captchaLogin, heartbeat, register, buildUNIPacket
};
