"use strict";
const zlib = require("zlib");
const tea = require("crypto-tea");
const ecdh = require("./ecdh");
const Writer = require("./writer");
const tlv = require("./tlv");
const {buildMessage} = require("./message");
const {uploadImages, uploadPtt, uploadMultiMessage} = require("./service");
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const BUF0 = Buffer.alloc(0);
const BUF16 = Buffer.alloc(16);

const CMD = {
    LOGIN:          "wtlogin.login", //send,recv
    REGISTER:       "StatSvc.register", //send,recv
    HEARTBEAT:      "Heartbeat.Alive", //send,recv
    GET_MSG:        "MessageSvc.PbGetMsg", //send,recv
    SEND_MSG:       "MessageSvc.PbSendMsg", //send,recv
    DELETE_MSG:     "MessageSvc.PbDeleteMsg", //send,recv
    RECALL:         "PbMessageSvc.PbMsgWithDraw", //send,recv
    FRIEND_LIST:    "friendlist.getFriendGroupList", //send,recv
    GROUP_LIST:     "friendlist.GetTroopListReqV2", //send,recv
    MEMBER_LIST:    "friendlist.GetTroopMemberListReq", //send,recv
    GROUP_CARD:     "friendlist.ModifyGroupCardReq", //send,recv
    ADD_FRIEND:     "",

    FRIEND_REQ:     "ProfileService.Pb.ReqSystemMsgNew.Friend", //send,recv
    FRIEND_REQ_ACT: "ProfileService.Pb.ReqSystemMsgAction.Friend", //send,recv
    GROUP_REQ:      "ProfileService.Pb.ReqSystemMsgNew.Group", //send,recv
    GROUP_REQ_ACT:  "ProfileService.Pb.ReqSystemMsgAction.Group", //send,recv
 
    GROUP_MSG:      "OnlinePush.PbPushGroupMsg", //recv(event)
    PUSH_NOTIFY:    "MessageSvc.PushNotify", //recv(event)
    ONLINE_PUSH:    "OnlinePush.ReqPush", //recv(event)
    ONLINE_PB_PUSH: "OnlinePush.PbPushTransMsg", //recv(event)

    GROUP_LEAVE:    "ProfileService.GroupMngReq", //send,recv
    GROUP_KICK:     "OidbSvc.0x8a0_0", //send,recv
    GROUP_BAN:      "OidbSvc.0x570_8", //send,recv
    GROUP_INVITE:   "",
    GROUP_TRANSFER: "",
    GROUP_DISMISS:  "",
    GROUP_ADMIN:    "",
    GROUP_TITLE:    "OidbSvc.0x8fc_2", //send,recv
    GROUP_SETTING:  "OidbSvc.0x89a_0", //send,recv

    PUSH_REQ:       "ConfigPushSvc.PushReq", //recv(event)
    PUSH_RESP:      "ConfigPushSvc.PushResp", //send
    OFFLINE:        "MessageSvc.PushForceOffline", //recv(event)
    MFS_OFFLINE:    "StatSvc.ReqMSFOffline", //recv(event)

    IMG_STORE:      "ImgStore.GroupPicUp", //send,recv
    OFF_PIC_UP:     "LongConn.OffPicUp", //send,recv
    PTT_UP:         "PttStore.GroupPttUp", //send,recv
    MULTI_UP:       "MultiMsg.ApplyUp", //send,recv
    MULTI_DOWN:     "MultiMsg.ApplyDown", //send,recv
}
// "StatSvc.GetOnlineStatus":                  null,
// "PttStore.GroupPttUp":                      null, 
// "PttStore.GroupPttDown":                    null,
// "MultiMsg.ApplyUp":                         null, //合并转发
// "MultiMsg.ApplyDown":                       null,
// "OidbSvc.0x8fc_2":                          null, //TroopManagement.EditSpecialTitle
// "OidbSvc.0x89a_0":                          null, //TroopManagement.GroupOperation
// "OidbSvc.0x88d_7":                          null, //TroopManagement.GetGroupInfo
// "OidbSvc.0x6d6_2":                          null, //群文件下载
// "ConfigPushSvc.PushDomain":                 null,
// MessageSvc.RequestPushStatus
// MessageSvc.PushReaded
// StatSvc.SvcReqMSFLoginNotify

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

//----------------------------------------------------------------------------------------

function buildClientRegisterRequestPacket(status, c) {
    c.nextSeq();
    const SvcReqRegister = jce.encodeStruct([
        c.uin,
        7, 0, "", status, 0, 0, 0, 0, 0, 0,
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
    return commonUNI(c, CMD.PUSH_RESP, body);
}

//获取和删除消息----------------------------------------------------------------------------------------------------

/**
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
function buildGetMessageRequestPacket(sync_flag, c) {
    c.nextSeq();
    let cookie = c.sync_cookie;
    if (!cookie) {
        cookie = pb.encode("SyncCookie", {
            time:   common.timestamp(),
            ran1:   common.rand(9),
            ran2:   common.rand(9),
            const1: c.const1,
            const2: c.const2,
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
    return commonUNI(c, CMD.GET_MSG, body);
}
function buildDeleteMessageRequestPacket(items ,c) {
    c.nextSeq();
    const body = pb.encode("DeleteMessageRequest", {items});
    return commonUNI(c, CMD.DELETE_MSG, body);
}

//好友列表群列表群员列表----------------------------------------------------------------------------------------------------

function buildFriendListRequestPacket(start, limit, c) {
    // c.nextSeq();
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
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetFriendListReq",
    };
    const body = jce.encodeWrapper({FL}, extra);
    return commonUNI(c, CMD.FRIEND_LIST, body);
}

function buildGroupListRequestPacket(c) {
    // c.nextSeq();
    const GetTroopListReqV2Simplify = jce.encodeStruct([
        c.uin, 1, BUF0, [], 1, 7, 0, 1, 1
    ]);
    const extra = {
        pkt_type:0x00,
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopListReqV2Simplify",
    };
    const body = jce.encodeWrapper({GetTroopListReqV2Simplify}, extra);
    return commonUNI(c, CMD.GROUP_LIST, body);
}

function buildGroupMemberListRequestPacket(group_id, next_uin, c) {
    // c.nextSeq();
    const GTML = jce.encodeStruct([
        c.uin, group_id, next_uin, common.code2uin(group_id), 2, 0, 0, 0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopMemberListReq",
    };
    const body = jce.encodeWrapper({GTML}, extra);
    return commonUNI(c, CMD.MEMBER_LIST, body);
}

//发消息----------------------------------------------------------------------------------------------------

async function buildPrivateMessageRequestPacket(user_id, message, escape, c) {
    let elems = await buildMessage(message, escape, false);
    const images = elems.shift().slice(0, 20), is_long = elems.pop();
    if (images.length > 0) {
        try {
            const resp = await c.send(buildOffPicUpRequestPacket(user_id, images, c));
            for (let i = 0; i < resp.msgTryUpImgRsp.length; ++i) {
                const v = resp.msgTryUpImgRsp[i];
                if (v.result > 0)
                    throw new Error(v.failMsg);
                images[i].key = v.upUkey;
                images[i].exists = v.boolFileExit;
                elems[images[i].index].notOnlineImage.resId = v.upResid;
                elems[images[i].index].notOnlineImage.downloadPath = v.upResid;
            }
            uploadImages(c.uin, resp.msgTryUpImgRsp[0].uint32UpIp, resp.msgTryUpImgRsp[0].uint32UpPort, images);
        } catch (e) {
            c.logger.debug(e.stack);
        }
    }

    if (!elems.length)
        throw new Error("消息内容为空");

    if (is_long)
        elems = await toLongMessageElems(user_id, elems, c);

    const target = c.findStranger(user_id);
    if (target && target.group_id) {
        var routing = {grpTmp: {
            groupUin: common.code2uin(target.group_id),
            toUin:    user_id,
        }};
    } else {
        var routing = {c2c: {toUin: user_id}};
    }

    c.nextSeq();
    const random = common.rand(4);
    c.curr_msg_id = common.genSelfMessageId(user_id, c.seq_id, random);
    const body = pb.encode("SendMessageRequest", {
        routingHead: routing,
        contentHead: {
            pkgNum: 1,
            pkgIndex: 0,
            divSeq: 0
        },
        msgBody: {
            richText: {elems}
        },
        msgSeq:     c.seq_id,
        msgRand:    random,
        SyncCookie: pb.encode("SyncCookie", {
            time:   common.timestamp(),
            ran1:   common.rand(9),
            ran2:   common.rand(9),
            const1: c.const1,
            const2: c.const2,
            const3: 0x1D
        })
    });
    return commonUNI(c, CMD.SEND_MSG, body);
}
async function buildSendGroupMessageRequestPacket(group_id, message, escape, as_long, c) {
    let elems = await buildMessage(message, escape, true);

    if (elems.length === 1) {
        return await buildGroupPttMessageRequestPacket(group_id, elems[0], c);
    }

    const images = elems.shift().slice(0, 20), is_long = elems.pop();
    if (images.length > 0) {
        try {
            const resp = await c.send(buildImageStoreRequestPacket(group_id, images, c));
            for (let i = 0; i < resp.msgTryUpImgRsp.length; ++i) {
                const v = resp.msgTryUpImgRsp[i];
                if (v.result > 0)
                    throw new Error(v.failMsg);
                images[i].key = v.upUkey;
                images[i].exists = v.boolFileExit;
                elems[images[i].index].customFace.fileId = v.fid.low;
            }
            uploadImages(c.uin, resp.msgTryUpImgRsp[0].uint32UpIp, resp.msgTryUpImgRsp[0].uint32UpPort, images);
        } catch (e) {
            c.logger.debug(e.stack);
        }
    }

    if (!elems.length)
        throw new Error("消息内容为空");

    if (is_long || as_long)
        elems = await toLongMessageElems(common.code2uin(group_id), elems, c);

    c.nextSeq();
    c.curr_msg_rand = common.rand();
    const body = pb.encode("SendMessageRequest", {
        routingHead: {grp: {groupCode: group_id}},
        contentHead: {pkgNum: 1},
        msgBody: {
            richText: {elems}
        },
        msgSeq:     c.seq_id,
        msgRand:    c.curr_msg_rand,
        syncCookie: BUF0,
        msgVia:     1,
    });
    return commonUNI(c, CMD.SEND_MSG, body);
}
async function toLongMessageElems(uin, elems, c) {
    const msg = [{
        head: {
            fromUin: c.uin,
            msgSeq:  c.nextSeq(),
            msgTime: common.timestamp(),
            msgUid:  0x01000000000000000n | BigInt(common.rand()),
            mutiltransHead: {
                msgId: common.rand(),
            },
            msgType: 82,
            groupInfo: {
                groupCode: common.uin2code(uin),
                groupRank: BUF0,
                groupName: BUF0,
                groupCard: c.nickname,
            },
        },
        body: {
            richText: {elems},
        },
    }];
    const compressed = zlib.gzipSync(pb.encode("PbMultiMsgTransmit", {
        msg, pbItemList: [{
            fileName: "MultiMsg",
            buffer:   pb.encode("PbMultiMsgNew", {msg}),
        }]
    }));
    let resp;
    try {
        resp = await c.send(buildMultiApplyUpRequestPacket(uin, compressed, 1, c));
        resp = resp.multimsgApplyupRsp[0];
        if (resp.result > 0)
            throw new Error();
        const body = pb.encode("LongReqBody", {
            subcmd:         1,
            termType:       5,
            platformType:   9,
            msgUpReq:       [{
                msgType:    3,
                dstUin:     uin,
                msgContent: compressed,
                storeType:  2,
                msgUkey:    resp.msgUkey,
            }],
        });
        uploadMultiMessage(c.uin, resp.uint32UpIp, resp.uint32UpPort, {
            buf: body,
            md5: common.md5(body),
            key: resp.msgSig
        });
    } catch (e) {
        throw new Error();
    }
    const templete = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<msg serviceID="35" templateID="1" action="viewMultiMsg"
        brief="这是一段长消息..."
        m_resid="${resp.msgResid}"
        m_fileName="${common.timestamp()}" sourceMsgId="0" url=""
        flag="3" adverSign="0" multiMsgFlag="1">
    <item layout="1">
        <title>这是一段长消息...</title>
        <hr hidden="false" style="0"/>
        <summary>点击查看完整消息</summary>
    </item>
    <source name="聊天记录" icon="" action="" appid="-1"/>
</msg>`;
    return [
        {
            richMsg: {
                template1: Buffer.concat([Buffer.from([1]), zlib.gzipSync(templete)]),
                serviceId: 35,
                msgResId:  BUF0,
            }
        },
        {
            generalFlags: {
                longTextFlag:  1,
                longTextResid: resp.msgResid,
                pbReserve:     Buffer.from([0x78, 0x00, 0xF8, 0x01, 0x00, 0xC8, 0x02, 0x00]),
            }
        },
    ];
}
async function buildGroupPttMessageRequestPacket(group_id, ptt, c) {
    const resp = await c.send(buildPttUpRequestPacket(group_id, ptt, c));
    const v = resp.msgTryUpPttRsp[0];
    if (!v.boolFileExit)
        await uploadPtt(ptt, v);
    c.nextSeq();
    c.curr_msg_rand = common.rand();
    const body = pb.encode("SendMessageRequest", {
        routingHead: {grp: {groupCode: group_id}},
        contentHead: {pkgNum: 1},
        msgBody: {
            richText: {
                ptt: {
                    fileType: 4,
                    fileMd5: ptt.md5,
                    fileName: ptt.md5.toString("hex") + ".amr",
                    fileSize: ptt.length,
                    boolValid: true,
                    groupFileKey: v.fileKey,
                    pbReserve: Buffer.from([8, 0, 40, 0, 56, 0]),
                }
            }
        },
        msgSeq:     c.seq_id,
        msgRand:    c.curr_msg_rand,
        syncCookie: BUF0,
        msgVia:     1,
    });
    return commonUNI(c, CMD.SEND_MSG, body);
}

//好友申请群申请----------------------------------------------------------------------------------------------------

function buildNewFriendRequestPacket(num, c) {
    c.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    num,
        version:   1000,
        checktype: 2,
        flag: {
            frdMsgDiscuss2ManyChat:       1,
            frdMsgGetBusiCard:            1,
            frdMsgNeedWaitingMsg:         1,
            frdMsgUint32NeedAllUnreadMsg: 1,
            grpMsgMaskInviteAutoJoin:     1,
        },
        friendMsgTypeFlag: 1,
    });
    return commonUNI(c, CMD.FRIEND_REQ, body);
}
function buildNewGroupRequestPacket(num, c) {
    c.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    num,
        version:   100,
        checktype: 3,
        flag: {
            grpMsgKickAdmin:                   1,
            grpMsgHiddenGrp:                   1,
            grpMsgWordingDown:                 1,
            grpMsgGetOfficialAccount:          1,
            grpMsgGetPayInGroup:               1,
            frdMsgDiscuss2ManyChat:            1,
            grpMsgNotAllowJoinGrpInviteNotFrd: 1,
            frdMsgNeedWaitingMsg:              1,
            frdMsgUint32NeedAllUnreadMsg:      1,
            grpMsgNeedAutoAdminWording:        1,
            grpMsgGetTransferGroupMsgFlag:     1,
            grpMsgGetQuitPayGroupMsgFlag:      1,
            grpMsgSupportInviteAutoJoin:       1,
            grpMsgMaskInviteAutoJoin:          1,
            grpMsgGetDisbandedByAdmin:         1,
            grpMsgGetC2CInviteJoinGroup:       1,
        },
        friendMsgTypeFlag: 1,
    });
    return commonUNI(c, CMD.GROUP_REQ, body);
}
function buildFriendRequestRequestPacket(flag, approve = true, block = false, c) {
    const {user_id, low, high} = common.parseFriendRequestFlag(flag);
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
        msgSeq:     {low, high, unsigned: false},
        reqUin:     user_id,
        subType:    1,
        srcId:      6,
        subSrcId:   7,
        actionInfo: {
            type:       approve?2:3,
            blacklist:  block?true:false
        },
    });
    return commonUNI(c, CMD.FRIEND_REQ_ACT, body);
}
function buildGroupRequestRequestPacket(flag, approve = true, reason = "", block = false, c) {
    const {user_id, group_id, low, high, invite} = common.parseGroupRequestFlag(flag);
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
        msgSeq:     {low, high, unsigned: false},
        reqUin:     user_id,
        subType:    1,
        srcId:      3,
        subSrcId:   invite?10016:31,
        groupMsgType:   invite?2:1,
        actionInfo: {
            type:       approve?11:12,
            groupCode:  group_id,
            blacklist:  block?true:false,
            msg:        reason,
            sig:        BUF0,
        },
    });
    return commonUNI(c, CMD.GROUP_REQ_ACT, body);
}

//撤回----------------------------------------------------------------------------------------------------

function buildFriendRecallRequestPacket(message_id, c) {
    c.nextSeq();
    const {user_id, seq, random, pkg, timestamp} = common.parseSelfMessageId(message_id);
    const body = pb.encode("MsgWithDrawReq", {
        c2cWithDraw: [{
            subCmd:     1,
            msgInfo:    [{
                fromUin:    c.uin,
                toUin:      user_id,
                msgTime:    timestamp,
                pkgNum:     pkg,
                pkgIndex:   pkg - 1,
                divSeq:     pkg - 1,
                msgSeq:     seq,
                msgRandom:  random,
                // msgType:    0,
            }],
            reserved: Buffer.from([0x8,0x0,0x10,0x0]),
            longMessageFlag: pkg === 1,
        }]
    });
    return commonUNI(c, CMD.RECALL, body);
}
function buildGroupRecallRequestPacket(message_id, c) {
    c.nextSeq();
    const {group_id, seq, random} = common.parseGroupMessageId(message_id);
    const body = pb.encode("MsgWithDrawReq", {
        groupWithDraw: [{
            subCmd:     1,
            groupCode:  group_id,
            msgList:    [{
                msgSeq:    seq,
                msgRandom: random,
                msgType:   0,
            }],
            userDef:    Buffer.from([8,0]),
        }]
    });
    return commonUNI(c, CMD.RECALL, body);
}

//群操作----------------------------------------------------------------------------------------------------

function buildSetGroupAdminRequestPacket() {}
function buildEditSpecialTitleRequestPacket() {}

function buildGroupSettingRequestPacket(group_id, k, v, c) {
    c.nextSeq();
    const qwerty = {
        groupCode: parseInt(group_id),
		stGroupInfo: {},
    };
    qwerty.stGroupInfo[k] = v;
    const body = pb.encode("OIDBSSOPkg", {
        command:    2202,
        bodybuffer: pb.encode("D89AReqBody", qwerty),
    });
    return commonUNI(c, CMD.GROUP_SETTING, body);
}

function buildEditGroupCardRequestPacket(group_id, user_id, card, c) {
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, card?card.toString():"", 0, "", "", ""
            ])
        ]
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "ModifyGroupCardReq",
    };
    const body = jce.encodeWrapper({MGCREQ}, extra);
    return commonUNI(c, CMD.GROUP_CARD, body);
}

function buildGroupKickRequestPacket(group_id, user_id, block, c) {
    c.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:    2208,
        bodybuffer: pb.encode("D8A0ReqBody", {
            optUint64GroupCode: group_id,
            msgKickList:        [{
                optUint32Operate:   5,
                optUint64MemberUin: user_id,
                optUint32Flag:      block?1:0,
            }],
            kickMsg:            BUF0
        })
    });
    return commonUNI(c, CMD.GROUP_KICK, body);
}
function buildGroupBanRequestPacket(group_id, user_id, duration, c) {
    c.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     1392,
        serviceType: 8,
        bodybuffer:  Buffer.concat([
            common.buildUinBuf(group_id),
            Buffer.from([32]), Buffer.from([0,1]), 
            common.buildUinBuf(user_id),
            common.buildUinBuf(duration),
        ])
    });
    return commonUNI(c, CMD.GROUP_BAN, body);
}
function buildGroupLeaveRequestPacket(group_id, c) {
    // c.nextSeq();
    const GroupMngReq = jce.encodeStruct([
        2, c.uin, Buffer.concat([common.buildUinBuf(c.uin), common.buildUinBuf(group_id)])
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GroupMngReq",
    };
    const body = jce.encodeWrapper({GroupMngReq}, extra);
    return commonUNI(c, CMD.GROUP_LEAVE, body);
}

//----------------------------------------------------------------------------------------------------

/**
 * @param {Object[]} images
 *  @field {Buffer} md5
 *  @field {Number} size
 */
function buildImageStoreRequestPacket(group_id, images, c) {
    c.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            groupCode:      group_id,
            srcUin:         c.uin,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            picType:        1000,
            buildVer:       "8.2.7.4410",
            appPicType:     1006,
            fileIndex:      BUF0,
            transferUrl:    BUF0,
        });
    }
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  1,
        msgTryUpImgReq: req,
        extension: BUF0,
    });
    return commonUNI(c, CMD.IMG_STORE, body);
}
function buildOffPicUpRequestPacket(user_id, images, c) {
    c.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            srcUin:         c.uin,
            dstUin:         user_id,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            imgOriginal:    1,
            imgType:        1000,
            buildVer:       "8.2.7.4410",
            fileIndex:      BUF0,
            srvUpload:      1,
            transferUrl:    BUF0,
        });
    }
    const body = pb.encode("ReqBody", {
        subcmd:  1,
        msgTryUpImgReq: req
    });
    return commonUNI(c, CMD.OFF_PIC_UP, body);
}
function buildPttUpRequestPacket(group_id, ptt, c) {
    c.nextSeq();
    const req = [];
    req.push({
        groupCode:      group_id,
        srcUin:         c.uin,
        fileMd5:        ptt.md5,
        fileSize:       ptt.size,
        fileName:       ptt.md5,
        fileId:         0,
        srcTerm:        5,
        platformType:   9,
        buType:         4,
        innerIp:        0,
        buildVer:       "6.5.5.663",
        voiceLength:    1,
        codec:          ptt.ext===".amr"?0:1,
        voiceType:      1,
        boolNewUpChan:  true,
    });
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  3,
        msgTryUpPttReq: req,
        extension: BUF0,
    });
    return commonUNI(c, CMD.PTT_UP, body);
}
function buildMultiApplyUpRequestPacket(uin, buf, bu, c) {
    c.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         bu,
        multimsgApplyupReq: [{
            dstUin:     uin,
            msgSize:    buf.length,
            msgMd5:     common.md5(buf),
            msgType:    3,
        }],
    });
    return commonUNI(c, CMD.MULTI_UP, body);
}
function buildMultiApplyDownRequestPacket(resid, c) {
    c.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         2,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         2,
        reqChannelType: 2,
        multimsgApplydownReq: [{
            msgResid:   resid,
            msgType:    3,
        }],
    });
    return commonUNI(c, CMD.MULTI_DOWN, body);
}

//----------------------------------------------------------------------------------------------------

module.exports = {

    CMD,

    // login
    buildPasswordLoginRequestPacket, buildCaptchaLoginRequestPacket, buildDeviceLoginRequestPacket,
    buildHeartbeatRequestPacket, buildClientRegisterRequestPacket, buildConfPushResponsePacket,

    // send&recv message
    buildGetMessageRequestPacket, buildDeleteMessageRequestPacket,
    buildPrivateMessageRequestPacket, buildSendGroupMessageRequestPacket,

    // get list&info
    buildFriendListRequestPacket, buildGroupListRequestPacket, buildGroupMemberListRequestPacket,

    // request
    buildGroupRequestRequestPacket, buildFriendRequestRequestPacket, buildNewFriendRequestPacket, buildNewGroupRequestPacket,

    // recall leave
    buildFriendRecallRequestPacket, buildGroupRecallRequestPacket, buildGroupLeaveRequestPacket,

    // group operation
    buildEditSpecialTitleRequestPacket, buildGroupSettingRequestPacket, buildSetGroupAdminRequestPacket,
    buildEditGroupCardRequestPacket, buildGroupKickRequestPacket, buildGroupBanRequestPacket,

    // service
    buildMultiApplyDownRequestPacket
};
