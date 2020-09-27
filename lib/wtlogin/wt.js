/**
 * @param {Client} c 
 * @param {Buffer} body 
 * @returns {Buffer}
 */
function commonOICQ(c, body) {
    body = new Writer()
        .writeU8(0x01)
        .writeU8(0x01)
        .writeBytes(c.random_key)
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
        .writeU32(c.uin)
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
 * @param {Client} c 
 * @param {String} command_name 
 * @param {Buffer} body 
 * @param {Buffer} ext_data 
 * @returns {Buffer}
 */
function commonSSO(c, command_name, body, ext_data = BUF0) {
    c.logger.trace(`send:${command_name} seq:${c.seq_id}`);
    const head = (function(){
        const stream = new Writer();
        stream.writeU32(c.seq_id)
            .writeU32(c.sub_appid)
            .writeU32(c.sub_appid)
            .writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])); // unknown
        if (!ext_data.length || ext_data.length === 4) stream.writeU32(0x04);
        else stream.writeWithLength(ext_data);
        return stream.writeWithLength(command_name)
            .writeU32(8)
            .writeBytes(c.session_id)
            .writeWithLength(c.device_info.imei)
            .writeU32(4)
            .writeU16(c.ksid.length + 2)
            .writeBytes(c.ksid)
            .writeU32(4)
            .read();
    })();
    return new Writer().writeWithLength(head).writeWithLength(body).read();
}

/**
 * @param {Number} uin UInt32
 * @param {Number} body_type UInt8
 * @param {Buffer} key 
 * @param {Buffer} body 
 * @param {Buffer} ext_data 
 * @returns {Buffer}
 */
function commonLogin(uin, body_type, key, body, ext_data = BUF0) {
    body = new Writer()
        .writeU32(0x00_00_00_0A)
        .writeU8(body_type)
        .writeWithLength(ext_data)
        .writeU8(0x00)
        .writeWithLength(uin.toString())
        .writeBytes(key.length ? tea.encrypt(body, key) : body)
        .read();
    return new Writer().writeWithLength(body).read();
}

//login&rsp----------------------------------------------------------------------------------------

/**
 * @param {Object} c an instance of Client
 * @returns {Buffer}
 */
function buildPasswordLoginRequestPacket(c) {
    c.nextSeq();
    const d = c.device_info;
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
        .writeBytes(tlv[0x018](16, c.uin))
        .writeBytes(tlv[0x001](c.uin, d.ip_address))
        .writeBytes(tlv[0x106](16, c.sub_appid, c.uin, 0, c.password_md5, true, d.guid, d.tgtgt_key))
        .writeBytes(tlv[0x116](184024956, 0x10400))
        .writeBytes(tlv[0x100](16, c.sub_appid))
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
        .writeBytes(tlv[0x154](c.seq_id))
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
    const sso = commonSSO(c, CMD.LOGIN, commonOICQ(c, body));
    return commonLogin(c.uin, 2, BUF16, sso);
}

/**
 * @param {String} captcha Buffer length = 4
 * @param {Buffer} sign 
 */
function buildCaptchaLoginRequestPacket(captcha, sign, c) {
    c.nextSeq();
    const body = new Writer()
        .writeU16(2)    // cmd
        .writeU16(4)    // tlv cnt
        .writeBytes(tlv[0x2](captcha, sign))
        .writeBytes(tlv[0x8](2052))
        .writeBytes(tlv[0x104](c.t104))
        .writeBytes(tlv[0x116](150470524, 66560))
        .read();
    const sso = commonSSO(c, CMD.LOGIN, commonOICQ(c, body));
    return commonLogin(c.uin, 2, BUF16, sso);
}
/**
 * @param {Buffer} t402 
 */
function buildDeviceLoginRequestPacket(t402, c) {
    c.nextSeq();
    const body = new Writer()
        .writeU16(20)   // cmd
        .writeU16(4)    // tlv cnt
        .writeBytes(tlv[0x8](2052))
        .writeBytes(tlv[0x104](c.t104))
        .writeBytes(tlv[0x116](150470524, 66560))
        .writeBytes(tlv[0x401](common.md5(Buffer.concat([
            c.device_info.guid, Buffer.from("stMNokHgxZUGhsYp"), t402
        ]))))
        .read();
    const sso = commonSSO(c, CMD.LOGIN, commonOICQ(c, body));
    return commonLogin(c.uin, 2, BUF16, sso);
}
function buildHeartbeatRequestPacket(c) {
    c.nextSeq();
    const sso = commonSSO(c, CMD.HEARTBEAT, BUF0);
    return commonLogin(c.uin, 0, BUF0, sso);
}

function buildClientRegisterRequestPacket(c) {
    c.nextSeq();
    const SvcReqRegister = jce.encodeStruct([
        c.uin,
        7, 0, "", 11, 0, 0, 0, 0, 0, 0,
        c.device_info.version.sdk, 1, "", 0, BUF0, c.device_info.guid, 2052, 0, c.device_info.model, c.device_info.model,
        c.device_info.version.release, 1, 1551, 0, null, 0, 31806887127679168n, "", 0, "MIUI",
        "ONEPLUS A5000_23_17", "", Buffer.from([0x0A, 0x04, 0x08, 0x2E, 0x10, 0x00, 0x0A, 0x05, 0x08, 0x9B, 0x02, 0x10, 0x00]), 0, BUF0, 0
    ]);
    const extra = {
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const sso = commonSSO(c, CMD.REGISTER, body, c.sign_info.tgt);
    return commonLogin(c.uin, 1, c.sign_info.d2key, sso, c.sign_info.d2);
}

function buildChangeStatusRequestPacket(status, c) {
    let sub = 0;
    if (status > 1000) {
        sub = status, status = 11;
    }
    const SvcReqRegister = jce.encodeStruct([
        c.uin,
        7, 0, "", status, 0, 0, 0, 0, 0, 248,
        c.device_info.version.sdk, 0, "", 0, null, c.device_info.guid, 2052, 0, c.device_info.model, c.device_info.model,
        c.device_info.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
        "", "", null, 1, null, 0, null, sub, 0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    return commonUNI(c, CMD.CHANGE_STATUS, body);
}

//tlv----------------------------------------------------------------------------------------------

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

function decodeT161(data, c) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    c.rollback_sig = readTlv(stream, 2)[0x172];
}
function decodeT119(data, c) {
    const reader = Readable.from(tea.decrypt(data, c.device_info.tgtgt_key), {objectMode:false});
    reader.read(2);
    const t = readTlv(reader, 2);
    if (t[0x130])
        decodeT130(t[0x130], c);
    c.t528 = t[0x528];
    c.t530 = t[0x530];
    c.ksid = t[0x108];
    if (t[0x186])
        decodeT186(t[0x186], c);
    if (t[0x11a])
        [c.nickname, c.age, c.sex] = readT11A(t[0x11a]);
    c.sign_info = {
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
function decodeT130(data, c) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    c.time_diff = stream.read(4).readInt32BE() - common.timestamp();
    c.t149 = stream.read(4);
}
function decodeT186(data, c) {
    c.pwd_flag = data[1] === 1;
}
function readT11A(data) {
    const stream = Readable.from(data, {objectMode:false});
    stream.read(2);
    const age = stream.read(1).readUInt8();
    const sex = friend_sex_map[stream.read(1).readUInt8()];
    let nickname = stream.read(stream.read(1).readUInt8() & 0xff);
    nickname = nickname ? nickname.toString() : "";
    return [nickname, age, sex];
}

//login----------------------------------------------------------------------------------------------

/**
 * @returns {void}
 */
function decodeLoginResponse(blob, c) {
    const stream = Readable.from(blob, {objectMode:false});
    stream.read(2);
    const type = stream.read(1).readUInt8();
    stream.read(2);
    const t = readTlv(stream, 2);
    if (type === 0) { //success
        c.t150 = t[0x150];
        if (t[0x161])
            decodeT161(t[0x161], c);
        decodeT119(t[0x119], c);
        return event.emit(c, "internal.login");
    }
    if (type === 2) { //captcha
        c.t104 = t[0x104]
        if (t[0x192]) { //slider captcha, not supported yet
            c.logger.error("收到滑动验证码，暂不支持。");
            return event.emit(c, "system.login.error", {
                message: `[登陆失败]暂不支持滑动验证码。`
            });
        }
        if (t[0x165]) { //image captcha
            const stream = Readable.from(t[0x105], {objectMode:false});
            const signLen = stream.read(2).readUInt16BE();
            stream.read(2);
            c.captcha_sign = stream.read(signLen);
            const image = stream.read();
            const filepath = path.join(c.dir, `captcha.jpg`);
            fs.writeFileSync(filepath, image);
            c.logger.info(`收到图片验证码，已保存到文件(${filepath})，请查看并输入: `);
            return event.emit(c, "system.login.captcha", {image});
        }
        c.logger.error("收到未知格式的验证码，暂不支持。");
        return event.emit(c, "system.login.error", {
            message: `[登陆失败]未知格式的验证码。`
        });
    }

    if (type === 160) {
        const url = t[0x204].toString();
        c.logger.info("需要验证设备信息，验证地址：" + url);
        return event.emit(c, "system.login.device", {url});
    }

    if (type === 204) {
        c.t104 = t[0x104];
        c.logger.info("login...");
        return c.write(outgoing.buildDeviceLoginRequestPacket(t[0x402], c));
    }

    if (t[0x149]) {
        const stream = Readable.from(t[0x149], {objectMode:false});
        stream.read(2);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        c.logger.error(message);
        return event.emit(c, "system.login.error", {message});
    }

    if (t[0x146]) {
        const stream = Readable.from(t[0x146], {objectMode:false});
        const version = stream.read(4);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        c.logger.error(message);
        return event.emit(c, "system.login.error", {message});
    }

    c.logger.error("[登陆失败]未知错误。");
    event.emit(c, "system.login.error", {
        message: `[登陆失败]未知错误。`
    });
}

/**
 * @returns {boolean}
 */
function decodeClientRegisterResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[9]?true:false;
}
