/**
 * 数据包解析
 * 系统事件处理
 * 私聊消息入口
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const tea = require("./tea");
const { uin2code, timestamp, BUF0, BUF16, NOOP } = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const { parseC2CMsg } = require("./message/parser");
const push = require("./online-push");
const sysmsg = require("./sysmsg");

/**
 * @this {import("./ref").Client}
 */
function submitDevice() {
    let body = pb.encode({
        1: 0,
        2: 31,
        5: {
            1: this.apk.subid,
            2: this.device.imei,
            3: this.device.guid,
            5: this.device.android_id,
            6: 1,
        }
    });
    this.sendOidb("OidbSvc.0x6de", body).catch(NOOP);
}

/**
 * @this {import("./ref").Client}
 */
function onPushReq(blob, seq) {
    if (blob[0] === 0)
        blob = blob.slice(4);
    const nested = jce.decode(blob);

    const PushResp = jce.encodeStruct([
        null, nested[1], nested[3], nested[1] === 3 ? nested[2] : null
    ]);
    const extra = {
        req_id: seq,
        service: "QQService.ConfigPushSvc.MainServant",
        method: "PushResp",
    };
    const body = jce.encodeWrapper({ PushResp }, extra);
    this.writeUni("ConfigPushSvc.PushResp", body);
}

/**
 * 新消息通知
 * @this {import("./ref").Client}
 */
function onPushNotify(blob) {
    if (!this.sync_finished) return;
    const nested = jce.decode(blob.slice(15));
    switch (nested[5]) {
    case 33:
    case 141:
    case 166:
    case 167:
    case 208:
    case 529:
        return getMsg.call(this);
    case 84:
    case 87:
    case 525:
        return sysmsg.getNewGroup.call(this, nested[5]);
    case 187:
        return sysmsg.getNewFriend.call(this);
    }
}

/**
 * 获取新消息
 * @this {import("./ref").Client}
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
async function getMsg(sync_flag = 0) {
    if (!this.sync_cookie)
        this.sync_cookie = this.buildSyncCookie();
    let body = pb.encode({
        1: sync_flag,
        2: this.sync_cookie,
        3: 0,
        4: 20,
        5: 3,
        6: 1,
        7: 1,
        9: 1,
    });
    try {
        const blob = await this.sendUni("MessageSvc.PbGetMsg", body);
        const rsp = pb.decode(blob);
        if (rsp[3])
            this.sync_cookie = rsp[3].raw;
        if (rsp[1] > 0 || !rsp[5])
            return true;
        const items = [];
        if (!Array.isArray(rsp[5]))
            rsp[5] = [rsp[5]];
        for (let v of rsp[5]) {
            if (!v[4]) continue;
            if (!Array.isArray(v[4]))
                v[4] = [v[4]];
            for (let msg of v[4]) {
                const head = msg[1];
                const type = head[3];
                const item = { ...head };
                item[3] = 187;
                items.push(item);
                if (!this.sync_finished)
                    continue;
                let uin = head[1];
                if (uin === this.uin && (this.config.ignore_self || uin !== head[2]))
                    continue;
                if (![33, 141, 166, 167, 208, 529].includes(type))
                    continue;
                if (this.msgExists(uin, type, head[5], head[6]))
                    continue;

                //群员入群
                if (type === 33) {
                    (async () => {
                        const group_id = uin2code(uin);
                        const user_id = head[15];
                        const nickname = String(head[16].raw);
                        const ginfo = (await this.getGroupInfo(group_id)).data;
                        if (!ginfo) return;
                        if (user_id === this.uin) {
                            this.logger.info(`更新了群列表，新增了群：${group_id}`);
                            this.getGroupMemberList(group_id);
                        } else {
                            ginfo.member_count++;
                            ginfo.last_join_time = timestamp();
                            await this.getGroupMemberInfo(group_id, user_id);
                            try {
                                if (this.gml.get(group_id).size)
                                    ginfo.member_count = this.gml.get(group_id).size;
                            } catch { }
                            this.logger.info(`${user_id}(${nickname}) 加入了群 ${group_id}`);
                        }
                        this.em("notice.group.increase", {
                            group_id, user_id, nickname
                        });
                    })();
                }

                //私聊消息
                else {
                    ++this.stat.recv_msg_cnt;
                    (async () => {
                        try {
                            const data = await parseC2CMsg.call(this, msg, true);
                            if (data && data.raw_message) {
                                data.reply = (message, auto_escape = false) => this.sendPrivateMsg(data.user_id, message, auto_escape);
                                this.logger.info(`recv from: [Private: ${data.user_id}(${data.sub_type})] ` + data.raw_message);
                                this.em("message.private." + data.sub_type, data);
                            }
                        } catch (e) {
                            this.logger.debug(e);
                        }
                    })();
                }
            }
        }

        if (items.length) {
            this.writeUni("MessageSvc.PbDeleteMsg", pb.encode({ 1: items }));
        }
        // if (rsp[4] !== 2)
        //     getMsg.call(this, rsp[4]);
        return true;
    } catch (e) {
        this.logger.debug("getMsg发生错误。");
        this.logger.debug(e);
        return false;
    }
}

/**
 * 强制下线通知(通常是被另一个相同端末挤掉了)
 */
function onForceOffline(blob) {
    fs.unlink(path.join(this.dir, "token"), NOOP);
    const nested = jce.decode(blob);
    this.emit("internal.kickoff", {
        type: "PushForceOffline",
        info: `[${nested[1]}]${nested[2]}`,
    });
}

/**
 * 强制下线通知(通常是冻结等特殊事件)
 */
function onMSFOffline(blob) {
    fs.unlink(path.join(this.dir, "token"), NOOP);
    const nested = jce.decode(blob);
    // if (parent[3].includes("如非本人操作，则密码可能已泄露"))
    //     return;
    this.emit("internal.kickoff", {
        type: "ReqMSFOffline",
        info: `[${nested[4]}]${nested[3]}`,
    });
}

//----------------------------------------------------------------------------------------------

function onQualityTest(blob, seq) {
    this.writeUni("QualityTest.PushList", BUF0, seq);
}
function onSidTicketExpired(blob, seq) {
    this.writeUni("OnlinePush.SidTicketExpired", BUF0, seq);
}
function onPushDomain() {
    // common.log(blob.toString("hex").replace(/(.)(.)/g, '$1$2 '));
}

/**
 * @param {Buffer} buf 
 */
function parseSSO(buf) {
    const seq = buf.readInt32BE(4);
    const retcode = buf.readInt32BE(8);
    if (retcode !== 0) {
        throw new Error("unsuccessful retcode: " + retcode);
    }
    let offset = buf.readUInt32BE(12) + 12;
    let len = buf.readUInt32BE(offset); // length of cmd
    const cmd = String(buf.slice(offset + 4, offset + len));

    if (cmd === "Heartbeat.Alive") {
        return {
            seq, cmd, payload: BUF0
        };
    }

    offset += len;
    len = buf.readUInt32BE(offset); // length of session_id
    offset += len;
    const flag = buf.readInt32BE(offset);
    let payload;
    if (flag === 0) {
        payload = buf.slice(offset + 8);
    } else if (flag === 1) {
        payload = zlib.unzipSync(buf.slice(offset + 8));
    } else if (flag === 8) {
        payload = buf.slice(offset + 4);
    } else
        throw new Error("unknown compressed flag: " + flag);
    return {
        seq, cmd, payload
    };
}

/**
 * @type {{[k: string]: (this: import("./ref").Client, payload: Buffer, seq?: number) => void}}
 */
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
// MessageSvc.RequestPushStatus 其他PC端login
// MessageSvc.PushReaded 其他端末已读
// StatSvc.SvcReqMSFLoginNotify 其他移动端login
// StatSvc.QueryHB

/**
 * @this {import("./ref").Client}
 * @param {Buffer} pkt
 */
function parseIncomingPacket(pkt) {
    const flag = pkt.readUInt8(4);
    const encrypted = pkt.slice(pkt.readUInt32BE(6) + 6);
    let decrypted;
    switch (flag) {
    case 0:
        decrypted = encrypted;
        break;
    case 1:
        decrypted = tea.decrypt(encrypted, this.sig.d2key);
        break;
    case 2:
        decrypted = tea.decrypt(encrypted, BUF16);
        break;
    default:
        throw new Error("unknown flag:" + flag);
    }
    const sso = parseSSO(decrypted);
    this.logger.trace(`recv:${sso.cmd} seq:${sso.seq}`);
    if (events[sso.cmd])
        events[sso.cmd].call(this, sso.payload, sso.seq);
    else if (this.handlers.has(sso.seq))
        this.handlers.get(sso.seq)(sso.payload);
}

module.exports = {
    parseIncomingPacket, getMsg, submitDevice
};
