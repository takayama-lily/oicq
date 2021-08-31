/**
 * 数据包解析
 * 系统事件处理
 */
"use strict";
module.exports = {
    onlineListener, offlineListener, networkErrorListener, packetListener,
};
const { Client, STATUS_ONLINE, STATUS_OFFLINE, STATUS_PENDING } = require("./client");
const tea = require("./algo/tea");
const pb = require("./algo/pb");
const jce = require("./algo/jce");
const { timestamp, BUF0, BUF16, unzip, log } = require("./common");
const push = require("./onlinepush");
const sysmsg = require("./core/sysmsg");
const { initFL, initGL } = require("./core/friendlist");
const { int32ip2str } = require("./service");

/**
 * @this {Client}
 */
async function getBlackList() {
    let body = pb.encode({
        1:  {
            1: this.uin,
            3: 0,
            4: 1000,
        }
    });
    let len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(body.length);
    body = Buffer.concat([Buffer.alloc(4), len, body]);
    try {
        const blob = await this.sendUni("SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList", body);
        let rsp = pb.decode(blob.slice(8))[1][6];
        this.blacklist = new Set;
        if (!rsp) return;
        if (!Array.isArray(rsp))
            rsp = [rsp];
        for (let v of rsp)
            this.blacklist.add(v[1]);
    } catch { }
}

/**
 * 这个包会推送大文件上传用ticket
 * @this {Client}
 */
function pushReqListener(blob, seq) {
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
    if (nested[1] === 2 && nested[2]) {
        const buf = jce.decodeNested(nested[2])[5][5];
        const decoded = pb.decode(buf)[1281];
        this.storage.sig_session = decoded[1].toBuffer();
        this.storage.session_key = decoded[2].toBuffer();
        for (let v of decoded[3]) {
            if (v[1] === 10) {
                this.storage.port = v[2][0][3];
                this.storage.ip = int32ip2str(v[2][0][2]);
            }
        }
    }
}

/**
 * 新消息通知
 * @this {Client}
 */
function pushNotifyListener(blob) {
    if (!this.sync_finished) return;
    const nested = jce.decode(blob.slice(15));
    switch (nested[5]) {
    case 33: //群员入群
    case 38: //建群
    case 85: //群申请被同意
    case 141: //陌生人
    case 166: //好友
    case 167: //单向好友
    case 208: //好友语音
    case 529: //离线文件
        return this.pbGetMsg();
    case 84: //群请求
    case 87: //群邀请
    case 525: //群请求(来自群员的邀请)
        return sysmsg.getNewGroup.call(this); 
    case 187: //好友请求
    case 191: //单向好友增加
        return sysmsg.getNewFriend.call(this);
    case 528: //黑名单
        return getBlackList.call(this).then(() => {
            this.em("sync.black", { blacklist: [...this.blacklist] });
        });
    }
}

/**
 * 强制下线通知(通常是被另一个相同端末挤掉了)
 * 会发多次，必须用once监听
 */
function forceOfflineListener(blob) {
    const nested = jce.decode(blob);
    this.emit("internal.kickoff", {
        type: "PushForceOffline",
        info: `[${nested[1]}]${nested[2]}`,
    });
}

/**
 * 强制下线通知(通常是冻结等特殊事件)
 * 会发多次，必须用once监听
 */
function msfOfflineListener(blob) {
    const nested = jce.decode(blob);
    this.emit("internal.kickoff", {
        type: "ReqMSFOffline",
        info: `[${nested[4]}]${nested[3]}`,
    });
}

/**
 * 会发多次，必须用once监听
 * @this {Client}
 */
function kickoffListener(data) {
    this._wt.deleteToken();
    this.status = STATUS_PENDING;
    this._stopHeartbeat();
    this.logger.warn(data.info);
    let sub_type;
    if (data.info.includes("如非本人操作")) {
        sub_type = "kickoff";
        if (this.config.kickoff) {
            this.logger.mark("3秒后重新连接..");
            setTimeout(this.login.bind(this), 3000);
        } else {
            this.terminate();
        }
    } else if (data.info.includes("下线通知")) {
        sub_type = "frozen";
        this.terminate();
    } else {
        sub_type = "unknown";
        this.logger.mark("3秒后重新连接..");
        setTimeout(this.login.bind(this), 3000);
    }
    this.em("system.offline." + sub_type, { message: data.info });
}

Client.prototype._register = async function () {
    if (!await this._wt.register()) {
        return this.emit("internal.network", "服务器繁忙(register)");
    }
    this.status = STATUS_ONLINE;
    if (!this.online_status)
        this.online_status = 11;
    this._startHeartbeat();
    if (!this.listenerCount("internal.kickoff")) {
        this.once("internal.kickoff", kickoffListener);
    }
    await this.pbGetMsg();
};

Client.prototype._var4 = 0;
Client.prototype._runCircleTask = function () {
    if (this._var4++ > 10) {
        this._wt.exchangeEmp();
        if (this.config.platform != 2 && this.config.platform != 3)
            this.setOnlineStatus(this.online_status);
        this._var4 = 0;
    }
    for (let time of this.seq_cache.keys()) {
        if (timestamp() - time >= 60)
            this.seq_cache.delete(time);
        else
            break;
    }
};
Client.prototype._startHeartbeat = function () {
    if (this._heartbeat)
        return;
    this._heartbeat = setInterval(async () => {
        this._runCircleTask();
        if (!await this.pbGetMsg() && this.isOnline()) {
            this.logger.warn("GetMsg timeout!");
            if (!await this.pbGetMsg() && this.isOnline())
                this._socket.destroy();
        }
        this._wt.heartbeat();
    }, 30000);
};
Client.prototype._stopHeartbeat = function () {
    clearInterval(this._heartbeat);
    this._heartbeat = null;
};

//----------------------------------------------------------------------------------------------

/**
 * @this {Client}
 */
async function onlineListener() {
    this.sync_finished = false;
    await this._register();
    if (!this.isOnline())
        return;
    this.logger.mark(`Welcome, ${this.nickname} ! 初始化资源...`);
    await Promise.all([
        initFL.call(this),
        initGL.call(this),
        getBlackList.call(this),
    ]);
    this.logger.mark(`加载了${this.fl.size}个好友，${this.gl.size}个群。`);
    this.sync_finished = true;
    this.logger.mark("初始化完毕，开始处理消息。");
    this.setOnlineStatus(this.online_status);
    this.pbGetMsg();
    this.em("system.online");
}

/**
 * @this {Client}
 */
function offlineListener() {
    this._stopHeartbeat();
    if (this.status === STATUS_OFFLINE) {
        return this.emit("internal.network", "网络不通畅。");
    } else if (this.status === STATUS_ONLINE) {
        ++this.stat.lost_times;
        setTimeout(() => {
            this._connect(this._register.bind(this));
        }, 50);
    }
    this.status = STATUS_OFFLINE;
}

/**
 * @this {Client}
 * @param {string} message 
 */
function networkErrorListener(message) {
    this.logger.error(message);
    if (this.status !== STATUS_OFFLINE)
        this.terminate();
    if (this.config.reconn_interval >= 1) {
        this.logger.mark(this.config.reconn_interval + "秒后重新连接。");
        setTimeout(this.login.bind(this), this.config.reconn_interval * 1000);
    }
    this.em("system.offline.network", { message });
}

//----------------------------------------------------------------------------------------------

function pushReadedListener(blob) {
    const nested = jce.decode(blob.slice(4));
    for (let v of nested[1]) {
        this.em("sync.readed", {
            sub_type: "private",
            user_id: v[0],
            timestamp: v[1],
        });
    }
    for (let v of nested[2]) {
        this.em("sync.readed", {
            sub_type: "group",
            group_id: v[0],
            seqid: v[3],
        });
    }
}

function qualityTestListener(blob, seq) {
    this.writeUni("QualityTest.PushList", BUF0, seq);
}
function sidTicketExpiredListener(blob, seq) {
    this.writeUni("OnlinePush.SidTicketExpired", BUF0, seq);
}
function pushDomainListener() {
    // common.log(blob.toString("hex").replace(/(.)(.)/g, '$1$2 '));
}

/**
 * @param {Buffer} buf 
 */
async function parseSSO(buf) {
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
        payload = await unzip(buf.slice(offset + 8));
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
const listeners = {
    "OnlinePush.PbPushGroupMsg": push.groupMsgListener,
    "OnlinePush.PbPushDisMsg": push.discussMsgListener,
    "OnlinePush.ReqPush": push.onlinePushListener,
    "OnlinePush.PbPushTransMsg": push.onlinePushTransListener,
    "OnlinePush.PbC2CMsgSync": push.c2cMsgSyncListener,
    "ConfigPushSvc.PushReq": pushReqListener,
    "MessageSvc.PushNotify": pushNotifyListener,
    "MessageSvc.PushForceOffline": forceOfflineListener,
    "StatSvc.ReqMSFOffline": msfOfflineListener,
    "QualityTest.PushList": qualityTestListener,
    "OnlinePush.SidTicketExpired": sidTicketExpiredListener,
    "ConfigPushSvc.PushDomain": pushDomainListener,
    "MessageSvc.PushReaded": pushReadedListener,
};

// MessageSvc.RequestPushStatus 其他PC端login
// StatSvc.SvcReqMSFLoginNotify 其他移动端login
// StatSvc.QueryHB

/**
 * @this {import("./ref").Client}
 * @param {Buffer} pkt
 */
async function packetListener(pkt) {
    ++this.stat.recv_pkt_cnt;
    try {
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
        const sso = await parseSSO(decrypted);
        this.logger.trace(`recv:${sso.cmd} seq:${sso.seq}`);
        if (this.handlers.has(sso.seq))
            return this.handlers.get(sso.seq)(sso.payload);
        if (Reflect.has(listeners, sso.cmd))
            listeners[sso.cmd].call(this, sso.payload, sso.seq);
        this.emit("internal.sso", sso);
    } catch (e) {
        this.logger.debug(e);
    }
}

module.exports = Client;
