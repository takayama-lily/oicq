"use strict";
const zlib = require("zlib");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const chat = require("./message/chat");
const push = require("./online-push");
const sysmsg = require("./sysmsg");
const BUF0 = Buffer.alloc(0);
const toInt = common.toInt;

/**
 * 无聊的通知
 */
function onPushReq(blob, seq) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);

    this.nextSeq();
    const PushResp = jce.encodeStruct([
        null, parent[1], parent[3], parent[1] === 3 ? parent[2] : null
    ]);
    const extra = {
        req_id:  seq,
        service: "QQService.ConfigPushSvc.MainServant",
        method:  "PushResp",
    };
    const body = jce.encodeWrapper({PushResp}, extra);
    this.writeUNI("ConfigPushSvc.PushResp", body);

    let ip, port;
    if (parent[1] === 1) {
        let server = jce.decode(parent[2])[1][0];
        server = jce.decode(server);
        ip = server[0], port = server[1];
    }
    //更换服务器理论上可以获得更好的性能和连接稳定性，一般来说无视这个包也没什么问题
    //据说前段时间服务器不稳定导致的频繁掉线和这个有关
    this.em("internal.change-server", {ip, port});
}

/**
 * 新消息通知
 */
function onPushNotify(blob) {
    if (!this.sync_finished) return;
    const nested = jce.decodeWrapper(blob.slice(15));
    const parent = jce.decode(nested);
    switch (parent[5]) {
        case 33:
        case 141:
        case 166:
        case 167:
        case 208:
            return getMsg.call(this);
        case 84:
        case 87:
            return sysmsg.getNewGroup.call(this);
        case 187:
            return sysmsg.getNewFriend.call(this);
    }
}

/**
 * 获取新消息
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
async function getMsg(sync_flag = 0) {
    this.nextSeq();
    if (!this.sync_cookie)
        this.sync_cookie = chat.buildSyncCookie.call(this);
    let body = pb.encode("GetMessageRequest", {
        syncFlag:           sync_flag,
        syncCookie:         this.sync_cookie,
        rambleFlag:         0,
        latestRambleNumber: 20,
        otherRambleNumber:  3,
        onlineSyncFlag:     1,
        contextFlag:        1,
        msgReqType:         1,
    });
    try {
        const blob = await this.sendUNI("MessageSvc.PbGetMsg", body);
        const o = pb.decode("GetMessageResponse", blob);
        if (o.syncCookie)
            this.sync_cookie = o.syncCookie;
        if (o.result > 0 || !o.uinPairMsgs)
            return;
        // common.log(o);
        const items = [];
        for (let v of o.uinPairMsgs) {
            if (!v.messages) continue;
            for (let msg of v.messages) {
                const {head, body, content} = msg;
                const type = head.msgType;
                head.msgType = 187;
                items.push(head);
                if (!this.sync_finished)
                    continue;
                let user_id = toInt(head.fromUin);
                if (user_id === this.uin && (this.ignore_self || user_id !== toInt(head.toUin)))
                    continue;
                // if (v.lastReadTime === -1 || v.lastReadTime > head.msgTime)
                //     continue;
                let update_flag = false;
                if (!this.seq_cache.has(user_id)) {
                    this.seq_cache.set(user_id, head.msgSeq);
                } else {
                    const seq = this.seq_cache.get(user_id);
                    if (seq - head.msgSeq >= 0 && seq - head.msgSeq < 1000)
                        continue;
                    else {
                        update_flag = Math.abs(head.msgSeq - seq) > 1 || head.msgSeq % 10 === 0;
                        this.seq_cache.set(user_id, head.msgSeq);
                    }
                }
                if (type === 33) {
                    (async()=>{
                        const group_id = common.uin2code(user_id);
                        user_id = toInt(head.authUin);
                        try {
                            const ginfo = (await this.getGroupInfo(group_id)).data;
                            if (user_id === this.uin) {
                                this.logger.info(`更新了群列表，新增了群：${group_id}`);
                                this.getGroupMemberList(group_id);
                            } else {
                                ginfo.member_count++;
                                ginfo.last_join_time = common.timestamp();
                                await this.getGroupMemberInfo(group_id, user_id);
                            }
                        } catch (e) {}
                        this.em("notice.group.increase", {
                            group_id, user_id,
                            nickname: head.authNick
                        });
                    })();
                }
                if ([141, 166, 167, 208].includes(type))
                    chat.onPrivateMsg.call(this, type, user_id, head, content, body, update_flag);
            }
        }

        if (items.length) {
            this.nextSeq();
            this.writeUNI("MessageSvc.PbDeleteMsg", pb.encode("DeleteMessageRequest", {items}));
        }
        if (o.syncFlag !== 2)
            getMsg.call(this, o.syncFlag);
    } catch (e) {
        this.logger.debug("getMsg发生错误。");
        this.logger.debug(e);
    }
}

/**
 * 强制下线通知(通常是被另一个相同端末挤掉了)
 */
function onForceOffline(blob) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    this.em("internal.kickoff", {
        type: "PushForceOffline",
        info: `[${parent[1]}]${parent[2]}`,
    });
}

/**
 * 强制下线通知(通常是冻结等特殊事件)
 */
function onMSFOffline(blob) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    if (parent[3].includes("如非本人操作，则密码可能已泄露"))
        return;
    this.em("internal.kickoff", {
        type: "ReqMSFOffline",
        info: `[${parent[4]}]${parent[3]}`,
    });
}

//----------------------------------------------------------------------------------------------

function onQualityTest(blob, seq) {
    this.writeUNI("QualityTest.PushList", BUF0, seq);
}
function onSidTicketExpired(blob, seq) {
    this.writeUNI("OnlinePush.SidTicketExpired", BUF0, seq);
}
function onPushDomain(blob, seq) {
    // common.log(blob.toString("hex").replace(/(.)(.)/g, '$1$2 '));
}

function parseSSO(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    stream.read(0);
    if (stream.read(4).readInt32BE() - 4 > stream.readableLength) {
        throw new Error("dropped");
    }
    const seq = stream.read(4).readInt32BE();
    const retcode = stream.read(4).readInt32BE();
    if (retcode) {
        throw new Error("return code unsuccessful: " + retcode);
    }
    stream.read(stream.read(4).readInt32BE() - 4);
    const cmd = stream.read(stream.read(4).readInt32BE() - 4).toString();
    const session_id = stream.read(stream.read(4).readInt32BE() - 4); //?
    if (cmd === "Heartbeat.Alive") {
        return {
            seq, cmd, payload: BUF0
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
        seq, cmd, payload
    };
}

const events = {
    "OnlinePush.PbPushGroupMsg": push.onGroupMsg,
    "OnlinePush.PbPushDisMsg": push.onDiscussMsg,
    "OnlinePush.ReqPush": push.onOnlinePush,
    "OnlinePush.PbPushTransMsg": push.onOnlinePushTrans,
    "OnlinePush.PbC2CMsgSync": push.onC2CMsgSync,
    "ConfigPushSvc.PushReq": onPushReq,
    "MessageSvc.PushNotify": onPushNotify,
    "MessageSvc.PushForceOffline": onForceOffline, 
    "StatSvc.ReqMSFOffline": onMSFOffline,
    "QualityTest.PushList": onQualityTest,
    "OnlinePush.SidTicketExpired": onSidTicketExpired,
    "ConfigPushSvc.PushDomain": onPushDomain,
};
// StatSvc.GetOnlineStatus
// PttStore.GroupPttDown
// MessageSvc.RequestPushStatus 其他端末上下线
// MessageSvc.PushReaded 其他端末已读
// StatSvc.SvcReqMSFLoginNotify 其他端末login
// StatSvc.QueryHB

/**
 * @param {Buffer} packet
 */
function parseIncomingPacket(packet) {
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
            decrypted = tea.decrypt(decrypted, this.sig.d2key);
            break;
        case 2:
            decrypted = tea.decrypt(decrypted, Buffer.alloc(16));
            break;
        default:
            throw new Error("decrypt failed");
    }
    const sso = parseSSO(decrypted);
    this.logger.trace(`recv:${sso.cmd} seq:${sso.seq}`);
    if (events[sso.cmd])
        events[sso.cmd].call(this, sso.payload, sso.seq);
    else if (this.handlers.has(sso.seq))
        this.handlers.get(sso.seq)(sso.payload);
}

module.exports = {
    parseIncomingPacket, getMsg
};
