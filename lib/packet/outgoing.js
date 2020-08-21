 "use strict";
const tea = require("crypto-tea");
const ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const BUF0 = Buffer.alloc(0);
const BUF16 = Buffer.alloc(16);

/**
 * @param {Client} c 
 * @param {Buffer} body 
 * @returns {Buffer}
 */
function commonOICQ(c, body) {
    // ecdh.gen();
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

/**
 * @param {Client} c 
 * @param {String} command_name 
 * @param {Buffer} body 
 * @param {Buffer} ext_data 
 * @returns {Buffer}
 */
function commonUNI(c, command_name, body, ext_data = BUF0) {
    c.logger.trace(`send:${command_name} seq:${c.seq_id}`);
    let uni = new Writer()
        .writeWithLength(command_name)
        .writeU32(8)
        .writeBytes(c.session_id)
        .writeWithLength(ext_data)
        .read();
    uni = new Writer().writeWithLength(uni).writeWithLength(body).read();
    uni = new Writer()
        .writeU32(0x0B)
        .writeU8(1) // body type
        .writeU32(c.seq_id)
        .writeU8(0)
        .writeWithLength(c.uin.toString())
        .writeBytes(tea.encrypt(uni, c.sign_info.d2key))
        .read();
    return new Writer().writeWithLength(uni).read();
}

//----------------------------------------------------------------------------------------

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
    const sso = commonSSO(c, "wtlogin.login", commonOICQ(c, body));
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
    const sso = commonSSO(c, "wtlogin.login", commonOICQ(c, body));
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
    const sso = commonSSO(c, "wtlogin.login", commonOICQ(c, body));
    return commonLogin(c.uin, 2, BUF16, sso);
}
function buildHeartbeatRequestPacket(c) {
    c.nextSeq();
    const sso = commonSSO(c, "Heartbeat.Alive", BUF0);
    return commonLogin(c.uin, 0, BUF0, sso);
}

//----------------------------------------------------------------------------------------

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
    const sso = commonSSO(c, "StatSvc.register", body, c.sign_info.tgt);
    return commonLogin(c.uin, 1, c.sign_info.d2key, sso, c.sign_info.d2);
}

/**
 * @param {Number} type UInt8
 * @param {Number} seq UInt32
 * @param {Buffer} jcebuf 
 */
function buildConfPushResponsePacket(type, seq, jcebuf, c) {
    c.nextSeq();
    const PushResp = jce.encodeStruct([
        null, type, seq, jcebuf
    ]);
    const extra = {
        service: "QQService.ConfigPushSvc.MainServant",
        method:  "PushResp",
    };
    const body = jce.encodeWrapper({PushResp}, extra);
    return commonUNI(c, "ConfigPushSvc.PushResp", body);
}

/**
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
function buildGetMessageRequestPacket(sync_flag, c) {
    c.nextSeq();
    let cookie = c.syncCookie;
    if (!cookie) {
        cookie = pb.encode("SyncCookie", {
            time:   common.timestamp(),
            ran1:   758330138,
            ran2:   2480149246,
            const1: 1167238020,
            const2: 3913056418,
            const3: 0x1D,
        });
    }
    let body = pb.encode("GetMessageRequest", {
        syncFlag:           sync_flag,
        syncCookie:         cookie,
        latestRambleNumber: 20,
        otherRambleNumber:  3,
        onlineSyncFlag:     1,
        contextFlag:        1,
        msgReqType:         1,
        pubaccountCookie:   BUF0,
        msgCtrlBuf:         BUF0,
        serverBuf:          BUF0,
    })
    return commonUNI(c, "MessageSvc.PbGetMsg", body);
}
function buildStartGetMessageRequestPacket(c) {
    return buildGetMessageRequestPacket(0, c);
}
function buildStopGetMessageRequestPacket(c) {
    return buildGetMessageRequestPacket(2, c);
}

function buildFriendListRequestPacket(start, limit, c) {
    c.nextSeq();
    const d50 = pb.encode("D50ReqBody", {
        appid:                   1002,
		reqMusicSwitch:          1,
		reqMutualmarkAlienation: 1,
		reqKsingSwitch:          1,
		reqMutualmarkLbsshare:   1,
    });
    const FL = jce.encodeStruct([
        3,
        start?1:0, c.uin, start, limit, 0, 0, 0, 0, 0, 1,
        27, [], 0, 0, 0, d50, BUF0, [13580, 13581, 13582]
    ]);
    const extra = {
        pkt_type:0x003,
        req_id:  common.rand(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetFriendListReq",
    };
    const body = jce.encodeWrapper({FL}, extra);
    return commonUNI(c, "friendlist.getFriendGroupList", body);
}

function buildGroupListRequestPacket(c) {
    c.nextSeq();
    const GetTroopListReqV2Simplify = jce.encodeStruct([
        c.uin, 1, BUF0, [], 1, 7, 0, 1, 1
    ]);
    const extra = {
        pkt_type:0x00,
        req_id:  c.nextReq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopListReqV2Simplify",
    };
    const body = jce.encodeWrapper({GetTroopListReqV2Simplify}, extra);
    return commonUNI(c, "friendlist.GetTroopListReqV2", body);
}

function buildGroupMemberListRequestPacket(group_uin, group_code, next_uin, c) {
    c.nextSeq();
    const GTML = jce.encodeStruct([
        c.uin, group_code, next_uin, group_uin, 2, 0, 0, 0
    ]);
    const extra = {
        req_id:  c.nextReq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopMemberListReq",
    };
    const body = jce.encodeWrapper({GTML}, extra);
    return commonUNI(c, "friendlist.GetTroopMemberListReq", body);
}

function buildDeleteMessageRequestPacket() {}

function buildSendFriendMessageRequestPacket(to, chain) {
    
}
function buildSendTempMessageRequestPacket() {}
function buildSendGroupMessageRequestPacket() {}

function buildFriendRequestRequestPacket(flag, approve = true, black = false) {
    flag = Buffer.from(flag, "hex");
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
		msgSeq:     flag.slice(0, 4).readInt32BE(),
		reqUin:     flag.slice(4).readInt32BE(),
		subType:    1,
		srcId:      6,
		subSrcId:   7,
		actionInfo: {
            type:       approve?11:12,
            blacklist:  black
        },
    })
    return commonUNI(c, "ProfileService.Pb.ReqSystemMsgAction.Friend", body);
}
function buildGroupRequestRequestPacket(flag, invite, approve = true, black = false, reason = "") {
    flag = Buffer.from(flag, "hex");
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
		msgSeq:     flag.slice(0, 4).readInt32BE(),
		reqUin:     flag.slice(4, 8).readInt32BE(),
		subType:    1,
		srcId:      3,
        subSrcId:   invite?10016:31,
        groupMsgType:   invite?10016:31,
		actionInfo: {
            type:       approve?11:12,
            groupCode:  flag.slice(8).readInt32BE(),
            blacklist:  black,
            msg:        reason,
            sig:        BUF0,
        },
    })
    return commonUNI(c, "ProfileService.Pb.ReqSystemMsgAction.Group", body);
}
function buildFriendRecallRequestPacket() {}
function buildGroupRecallRequestPacket() {}

function buildEditSpecialTitleRequestPacket() {}
function buildGroupOperationRequestPacket() {}
function buildEditGroupCardRequestPacket() {}
function buildGroupKickRequestPacket() {}
function buildGroupMuteRequestPacket() {}
function buildQuitGroupRequestPacket() {}

function buildGroupFileDownloadRequestPacket() {}
function buildUploadImageRequestPacket() {}

module.exports = {
    buildPasswordLoginRequestPacket, buildCaptchaLoginRequestPacket, buildDeviceLoginRequestPacket,
    buildHeartbeatRequestPacket, buildClientRegisterRequestPacket, buildConfPushResponsePacket,

    buildStartGetMessageRequestPacket, buildStopGetMessageRequestPacket, buildDeleteMessageRequestPacket,
    buildFriendListRequestPacket, buildGroupListRequestPacket, buildGroupMemberListRequestPacket,
    buildSendFriendMessageRequestPacket, buildSendTempMessageRequestPacket, buildSendGroupMessageRequestPacket,

    buildGroupRequestRequestPacket, buildFriendRequestRequestPacket, buildQuitGroupRequestPacket,
    buildFriendRecallRequestPacket, buildGroupRecallRequestPacket,

    buildEditSpecialTitleRequestPacket, buildGroupOperationRequestPacket,
    buildEditGroupCardRequestPacket, buildGroupKickRequestPacket, buildGroupMuteRequestPacket,

    buildGroupFileDownloadRequestPacket, buildUploadImageRequestPacket
};
