"use strict";
const zlib = require("zlib");
const Readable = require("stream").Readable;
const tea = require('crypto-tea');
const ecdh = require("./ecdh");
const exception = require("../exception");
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const outgoing = require("./outgoing");
const event = require("../event");
const fs = require("fs");
const util = require("util");

/**
 * @param {Buffer} buf 
 * @returns {Object}
 */
function parseSSO(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    stream.read(0);
    if (stream.read(4).readInt32BE() - 4 > stream.readableLength) {
        throw new Error("dropped");
    }
    const seq_id = stream.read(4).readInt32BE();
    const retcode = stream.read(4).readInt32BE();
    if (retcode) {
        throw new Error("return code unsuccessful: " + retcode);
    }
    stream.read(stream.read(4).readInt32BE() - 4);
    const command_name = stream.read(stream.read(4).readInt32BE() - 4).toString();
    const session_id = stream.read(stream.read(4).readInt32BE() - 4);
    if (command_name === "Heartbeat.Alive") {
        return {
            seq_id, command_name, session_id, payload: Buffer.alloc(0)
        };
    }

    const compressed = stream.read(4).readInt32BE();
    var payload;
    if (compressed === 0) {
        stream.read(4);
        payload = stream.read();
    } else if (compressed === 1) {
        stream.read(4);
        payload = zlib.unzipSync(stream.read());
    } else if (compressed === 8) {
        payload = stream.read();
    } else
        throw new Error("unknown compressed flag: " + compressed)
    return {
        seq_id, command_name, session_id, payload
    };
}

/**
 * @param {Buffer} buf 
 * @returns {Buffer}
 */
function parseOICQ(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    if (stream.read(1).readUInt8() !== 2) {
        throw new Error("unknown flag");
    }
    stream.read(2);
    stream.read(2);
    stream.read(2);
    stream.read(2);
    stream.read(4);
    const encrypt_type = stream.read(2).readUInt16BE();
    stream.read(1)
    if (encrypt_type === 0) {
        const encrypted = stream.read(stream.readableLength - 1);
        let decrypted = tea.decrypt(encrypted, ecdh().share_key);
        return decrypted;
    } else if (encrypt_type === 4) {
        throw new Error("todo");
    } else
        throw new Error("unknown encryption method: " + encrypt_type);
}

//----------------------------------------------------------------------------------------------

/**
 * @param {Readable} stream 
 * @param {Number} size 
 * @returns {Object} a map
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
        decodeT186(t[0x186], c)
    if (t[0x11a])
        [c.nickname, c.age, c.gender] = readT11A(t[0x11a]);
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
    }
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
    const gender = stream.read(1).readUInt8();
    const nickname = stream.read(stream.read(1).readUInt8() & 0xff).toString();
    return [nickname, age, gender];
}

//----------------------------------------------------------------------------------------------

async function decodeLoginResponse(blob, c) {
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
            c.logger.error("收到图片验证码。");
            c.logger.info(await require('terminal-image').buffer(image));
            return //event.emit(c, "system.login.captcha", {image});
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

function decodeHeartbeatResponse() {
    return {retcode: 0};
}
function decodeClientRegisterResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const ret = {retcode: 0, data: {
        status: parent[16]
    }};
    // {
    //     '0': xxxxxxxxxx, //uin
    //     '1': 7, //bid
    //     '2': 0, //conn type
    //     '3': '',
    //     '4': 1598053481, //timestamp
    //     '5': 0,
    //     '6': 0,
    //     '7': 0,
    //     '8': 5, //?
    //     '9': 1, //?success?
    //     '10': 'x.x.x.x', //ip
    //     '11': 1515,
    //     '12': 270,
    //     '13': 8, //?
    //     '14': 1, //?success?
    //     '15': <Buffer >,
    //     '16': 11, //status
    //     '17': 0,
    //     '18': 300,
    //     '19': 600
    // }
    if (!parent[9])
        ret.retcode = 1;
    return ret;
}
function decodePushDomainEvent(blob, c) {}
function decodePushReqEvent(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    c.write(outgoing.buildConfPushResponsePacket(parent[1], parent[3], parent[2], c));
}

//----------------------------------------------------------------------------------------------------

function decodeMessageSvcResponse(blob, c) {
    const o = pb.decode("GetMessageResponse", blob);
    c.syncCookie = o.syncCookie;
    c.pubAccountCookie = o.PubAccountCookie;
    c.msgCtrlBuf = o.MsgCtrlBuf;
    //todo
    // for (let v of o.uinPairMsgs) {
    //     for (let vv of v.messages) {

    //     }
    // }
    // console.log(util.inspect(o, {depth: 20}));
    return {retcode: 0};
}

function decodePrivateMessageEvent(blob, c) {
    c.write(outgoing.buildStartGetMessageRequestPacket(c));
}

function decodeGroupMessageEvent(blob, c) {
    const o = pb.decode("PushMessagePacket", blob);
    if (c.ignore_self && o.message.head.fromUin === c.uin)
        return;
    //todo
}

//----------------------------------------------------------------------------------------------------

const friend_sex_map = {
    "0":"unknown", "1":"male", "2":"female"
};
const group_sex_map = {
    "-1":"unknown", "0":"male", "1":"female"
};
function decodeFriendListResponse(blob, c) {
    const ret = {retcode: 0, data: {}};
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const list = parent[7];
    for (let v of list) {
        v = jce.decode(v);
        ret.data[v[0]] = {
            user_id:    v[0],
            nickname:   v[14],
            remark:     v[3],
            sex:        friend_sex_map[v[31]],
            age:        0, //暂无
        }
    }
    return ret;
}
function decodeGroupListResponse(blob, c) {
    const ret = {retcode: 0, data: {}};
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const list = parent[5]; //parent[7]
    for (let v of list) {
        v = jce.decode(v);
        ret.data[v[1]] = {
            uin:                v[0],
            group_id:           v[1],
            group_name:         v[4],
            member_count:       v[19],
            max_member_count:   v[29],
            owner_uid:          v[23],
            last_join_time:     v[27],
        }
    }
    return ret;
}
function decodeGroupMemberListResponse(blob, c) {
    const ret = {retcode: 0, data: {}};
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const group_id = parent[2];
    ret.data.next = parent[4];
    if (!c.group_list[group_id])
        return ret;
    const list = parent[3];
    for (let v of list) {
        v = jce.decode(v);
        ret.data[v[0]] = {
            group_id:           group_id,
            user_id:            v[0],
            nickname:           v[4],
            card:               v[8],
            sex:                group_sex_map[v[3]],
            age:                v[2],
            area:               "unknown",
            join_time:          v[15],
            last_sent_time:     v[16],
            level:              v[14],
            role:               v[18] ? "admin" : "member",
            unfriendly:         false,
            title:              v[23],
            title_expire_time:  v[24] === 4294967295 ? -1 : v[24],
            card_changeable:    true,
        }
    }
    const owner = c.group_list[group_id].owner_uid;
    ret.data[owner].role = "owner";
    return ret;
}

//----------------------------------------------------------------------------------------------------

function genFriendRequestFlag(seq_id, user_id) {
    const buf1 = Buffer.alloc(4), buf2 = Buffer.alloc(4);
    buf1.writeInt32BE(seq_id), buf2.writeInt32BE(user_id);
    return Buffer.concat([buf1, buf2]).toString("hex");
}
function genGroupRequestFlag(seq_id, user_id, group_code) {
    const buf1 = Buffer.alloc(4), buf2 = Buffer.alloc(4), buf3 = Buffer.alloc(4);
    buf1.writeInt32BE(seq_id), buf2.writeInt32BE(user_id), buf3.writeInt32BE(group_code);
    return Buffer.concat([buf1, buf2, buf3]).toString("hex");
}

function decodeFriendRequestEvent(blob, c) {
    const o = pb.decode("PushMessagePacket", blob);
    const v = o.friendmsgs[0];
    event.emit(c, "request.friend.add", {
        user_id:        v.reqUin,
        nickname:       v.msg.reqUinNick,
        comment:        v.msg.msgAdditional,
        flag:           genFriendRequestFlag(v.msgSeq, v.reqUin),
    });
}
function decodeGroupRequestEvent(blob, c) {
    const o = pb.decode("RspSystemMsgNew", blob);
    const v = o.groupmsgs[0];
    if (st.msg.subType === 1) {
        if (st.msg.groupMsgType === 1) {
            event.emit(c, "request.group.add", {
                group_id:       v.msg.groupCode,
                group_name:     v.msg.groupName,
                user_id:        v.reqUin,
                nickname:       v.msg.reqUinNick,
                comment:        v.msg.msgAdditional,
                flag:           genGroupRequestFlag(v.msgSeq, v.reqUin, v.msg.groupCode),
            });
        } else if (st.msg.groupMsgType === 2) {
            event.emit(c, "request.group.invite", {
                group_id:       v.msg.groupCode,
                group_name:     v.msg.groupName,
                user_id:        v.msg.actionUin,
                nickname:       v.msg.actionUinNick,
                flag:           genGroupRequestFlag(v.msgSeq, v.msg.actionUin, v.msg.groupCode),
            });
        }
    }
}

function decodeFriendGroupEvent() {}
function decodeGroupMemberEvent() {}

//----------------------------------------------------------------------------------------------------

function decodeForceOfflineEvent(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    event.emit(c, "internal.kickoff", {
        type: "PushForceOffline",
        info: `[${parent[1]}]${parent[2]}`,
    })
}
function decodeReqMSFOfflineEvent(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    console.log(parent);
    // event.emit(c, "internal.kickoff", {
    //     type: "ReqMSFOffline",
    //     info: `[${parent[3]}]${parent[4]}`,
    // })
}

//----------------------------------------------------------------------------------------------------

const decoders = {
    "wtlogin.login":                            decodeLoginResponse,
    "StatSvc.register":                         decodeClientRegisterResponse,   //更改在线状态的响应包
    "StatSvc.GetOnlineStatus":                  null,
    "Heartbeat.Alive":                          decodeHeartbeatResponse,

    "MessageSvc.PbGetMsg":                      decodeMessageSvcResponse,       //获取私聊消息的响应包 
    "MessageSvc.PbSendMsg":                     null, //发消息的响应包
    "MessageSvc.PbDeleteMsg":                   null, //删除消息的响应包(删除应该指既读)
    "PbMessageSvc.PbMsgWithDraw":               null, //群撤回?
    
    "friendlist.getFriendGroupList":            decodeFriendListResponse,       //好友列表响应包
    "friendlist.GetTroopListReqV2":             decodeGroupListResponse,        //群列表响应包
    "friendlist.GetTroopMemberListReq":         decodeGroupMemberListResponse,  //群员列表响应包

    // "friendlist.ModifyGroupCardReq":            null, //TroopManagement.EditGroupNametag 改名片?

    // "ImgStore.GroupPicUp":                      null, //群图片
    // "PttStore.GroupPttUp":                      null, //群语音
    // "PttStore.GroupPttDown":                    null,
    // "LongConn.OffPicUp":                        null,
    // "LongConn.OffPicDown":                      null,
    // "MultiMsg.ApplyUp":                         null, //合并转发
    // "MultiMsg.ApplyDown":                       null,

    // "OidbSvc.0x8fc_2":                          null, //TroopManagement.EditSpecialTitle 改头衔
    // "OidbSvc.0x570_8":                          null, //TroopManagement.Mute 禁言
    // "OidbSvc.0x89a_0":                          null, //TroopManagement.GroupOperation 群设置
    // "OidbSvc.0x88d_7":                          null, //TroopManagement.GetGroupInfo
    // "OidbSvc.0x8a0_0":                          null, //TroopManagement.Kick 踢人
    // "OidbSvc.0x6d6_2":                          null, //群文件下载
    
    "ProfileService.Pb.ReqSystemMsgNew.Group":  decodeGroupRequestEvent,        //加群申请、入群邀请事件
    "ProfileService.Pb.ReqSystemMsgNew.Friend": decodeFriendRequestEvent,       //好友申请事件

    "MessageSvc.PushNotify":                    decodePrivateMessageEvent,      //有私聊消息(无消息体，需要调用startGetMessage获取消息)
    "OnlinePush.PbPushGroupMsg":                decodeGroupMessageEvent,        //有群消息(有消息体)
    "OnlinePush.ReqPush":                       decodeFriendGroupEvent,         //一些群事件和好友事件
    "OnlinePush.PbPushTransMsg":                decodeGroupMemberEvent,         //一些群事件(成员变动,权限)

    "ConfigPushSvc.PushReq":                    decodePushReqEvent,             //响应ConfigPushSvc.PushResp
    "MessageSvc.PushForceOffline":              decodeForceOfflineEvent,        //强制下线
    "StatSvc.ReqMSFOffline":                    decodeReqMSFOfflineEvent,       //响应StatSvc.RspMSFForceOffline
    "ProfileService.GroupMngReq":               null, //?
    "ConfigPushSvc.PushDomain":                 decodePushDomainEvent,          //这个好像没什么用?
};

//----------------------------------------------------------------------------------------------

/**
 * @typedef {Object} OICQResponse 
 * @field retcode Number 0or1
 * @field data Object
 * @field error Object
 * 
 * @param {Buffer} packet 
 * @param {Buffer} c an instance of Client
 */
module.exports = function parseIncomingPacket(packet, c) {
    const stream = Readable.from(packet, {objectMode:false});
    const flag1 = stream.read(4).readInt32BE();
    if (flag1 !== 0x0A && flag1 !== 0x0B)
        throw new Error("decrypt failed");
    const flag2 = stream.read(1).readUInt8();
    const flag3 = stream.read(1).readUInt8();
    if (flag3 !== 0)
        throw new Error("unknown flag");
    stream.read(stream.read(4).readInt32BE() - 4);
    let decrypted = stream.read();
    switch (flag2) {
        case 0:
            break;
        case 1:
            decrypted = tea.decrypt(decrypted, c.sign_info.d2key);
            break;
        case 2:
            decrypted = tea.decrypt(decrypted, Buffer.alloc(16));
            break;
        default:
            decrypted = Buffer.alloc(0)
            break;
    }
    if (!decrypted.length)
        throw new Error("decrypt failed");
 
    const sso = parseSSO(decrypted);
    c.logger.trace(`recv:${sso.command_name} seq:${sso.seq_id}`);

    const ret = {
        retcode: 1,
        error: undefined,
        data: undefined
    };

    if (flag2 === 2)
        sso.payload = parseOICQ(sso.payload);
    if (decoders[sso.command_name]) {
        const decoded = decoders[sso.command_name](sso.payload, c, sso.seq_id);
        if (decoded) {
            ret.retcode = decoded.retcode;
            ret.error = decoded.error;
            ret.data = decoded.data;
        }
    } else {
        ret.error = {
            code: exception.codes.COMMAND_NAME_UNKNOWN
        }
    }
    if (c.handlers[sso.seq_id]) {
        clearTimeout(c.handlers[sso.seq_id].t);
        const cb = c.handlers[sso.seq_id].cb;
        delete c.handlers[sso.seq_id];
        cb(ret);
    }
};
