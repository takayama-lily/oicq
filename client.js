"use strict";
const version = require("./package.json");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const spawn = require("child_process");
const crypto = require("crypto");
const log4js = require("log4js");
const device = require("./device");
const {checkUin, timestamp} = require("./lib/common");
const core = require("./lib/core");
const resource = require("./lib/resource");
const sysmsg = require("./lib/sysmsg");
const wt = require("./lib/wtlogin/wt");
const chat = require("./lib/message/chat");
const indi = require("./lib/individual");
const troop = require("./lib/troop");
const {getErrorMessage} = require("./exception");
const BUF0 = Buffer.alloc(0);

const server_list = [
    {ip:"msfwifi.3g.qq.com", port:8080},
];

function buildApiRet(retcode, data = null, error = null) {
    data = data ? data : null;
    error = error ? error : null;
    const status = retcode ? (retcode===1?"async":"failed") : "ok";
    return {
        retcode, data, status, error
    };
}

class TimeoutError extends Error {}

class Client extends net.Socket {
    static OFFLINE = Symbol("OFFLINE");
    static INIT = Symbol("INIT");
    static ONLINE = Symbol("ONLINE");
}
class AndroidClient extends Client {
    reconn_flag = true;
    status = Client.OFFLINE;

    nickname = "";
    age = 0;
    sex = "unknown";
    online_status = 0;
    fl = new Map(); //friendList
    sl = new Map(); //strangerList
    gl = new Map(); //groupList
    gml = new Map(); //groupMemberList

    recv_timestamp = 0;
    send_timestamp = 0xffffffff;
    heartbeat = null;
    seq_id = 0;
    handlers = new Map();
    seq_cache = new Map();

    session_id = crypto.randomBytes(4);
    random_key = crypto.randomBytes(16);

    sig = {
        srm_token: BUF0,
        tgt: BUF0,
        tgt_key: BUF0,
        st_key: BUF0,
        st_web_sig: BUF0,
        skey: BUF0,
        d2: BUF0,
        d2key: BUF0,
        sig_key: BUF0,
        ticket_key: BUF0,
        device_token: BUF0,
        emp_time: timestamp(),
    };
    cookies = {};

    sync_finished = false;
    sync_cookie;
    const1 = crypto.randomBytes(4).readUInt32BE();
    const2 = crypto.randomBytes(4).readUInt32BE();
    const3 = crypto.randomBytes(1)[0];

    stat = {
        start_time: timestamp(),
        lost_times: 0,
        recv_pkt_cnt: 0,
        sent_pkt_cnt: 0,
        recv_msg_cnt: 0,
        sent_msg_cnt: 0,
    };

    constructor(uin, config) {
        super();
        this.uin = uin;

        config = {
            platform: 2,
            log_level: "info",
            kickoff: false,
            ignore_self:true,
            resend: true,
            data_dir: path.join(process.mainModule.path, "data"),
            ...config
        };
        this.config = config;
        this.dir = createDataDir(config.data_dir, uin);
        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        const filepath = path.join(this.dir, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device = device.getDeviceInfo(filepath);
        this.apk = device.getApkInfo(config.platform);
        if (config.platform == 3)
            this.apk.subid = 537061176;
        this.ksid = Buffer.from(`|${this.device.imei}|` + this.apk.name);

        this.on("error", (err)=>{
            this.logger.error(err.message);
        });
        this.on("close", (e_flag)=>{
            this.read();
            ++this.stat.lost_times;
            if (this.remoteAddress)
                this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.stopHeartbeat();
            if (this.status === Client.OFFLINE) {
                this.logger.error("网络不通畅。");
                return this.em("system.offline.network", {message: "网络不通畅"});
            }
            this.status = Client.OFFLINE;
            if (this.reconn_flag) {
                if (e_flag)
                    this.reconn_flag = false;
                setTimeout(()=>{
                    this._connect(this.register.bind(this));
                }, 500);
            }
        });

        // 在这里拆分包
        this.on("readable", ()=>{
            while (this.readableLength > 4) {
                let len_buf = this.read(4);
                let len = len_buf.readInt32BE();
                if (this.readableLength >= len - 4) {
                    this.reconn_flag = true;
                    this.recv_timestamp = Date.now();
                    const packet = this.read(len - 4);
                    ++this.stat.recv_pkt_cnt;
                    try {
                        core.parseIncomingPacket.call(this, packet);
                    } catch (e) {
                        this.logger.debug(e.stack);
                        this.em("internal.exception", e);
                    }
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        })

        this.on("internal.login", async()=>{
            this.logger.info(`Welcome, ${this.nickname} ! 开始初始化资源...`);
            this.sync_cookie = null;
            this.sync_finished = false;
            await this.register();
            if (!this.isOnline())
                return;
            await Promise.all([
                resource.initFL.call(this),
                resource.initGL.call(this)
            ]);
            this.logger.info(`加载了${this.fl.size}个好友，${this.gl.size}个群。`);
            await core.getMsg.call(this);
            this.sync_finished = true;
            this.logger.info("初始化完毕，开始处理消息。");
            this.em("system.online");
        });
    }

    _connect(callback = ()=>{}) {
        if (this.status !== Client.OFFLINE) {
            return callback();
        }
        const {ip, port} = server_list[0];
        this.logger.info(`connecting to ${ip}:${port}`);
        this.connect(port, ip, ()=>{
            this.status = Client.INIT;
            this.logger.info(`${this.remoteAddress}:${this.remotePort} connected`);
            this.resume();
            callback();
        });
    }

    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1;
        return this.seq_id;
    }

    async send(packet, timeout = 3000) {
        ++this.stat.sent_pkt_cnt;
        const seq_id = this.seq_id;
        return new Promise((resolve, reject)=>{
            this.write(packet, ()=>{
                const id = setTimeout(()=>{
                    this.handlers.delete(seq_id);
                    reject(new TimeoutError());
                    this.em("internal.timeout", {seq_id});
                }, timeout);
                this.handlers.set(seq_id, (data)=>{
                    clearTimeout(id);
                    this.handlers.delete(seq_id);
                    resolve(data);
                });
            });
        });
    }
    writeUNI(cmd, body, seq) {
        ++this.stat.sent_pkt_cnt;
        this.write(wt.build0x0BPacket.apply(this, arguments));
    }
    async sendUNI(cmd, body, seq) {
        return await this.send(wt.build0x0BPacket.apply(this, arguments));
    }

    startHeartbeat() {
        if (this.heartbeat)
            return;
        this.heartbeat = setInterval(async()=>{
            this.doCircle();
            try {
                await wt.heartbeat.call(this);
            } catch {
                try {
                    await wt.heartbeat.call(this);
                } catch {
                    this.logger.warn("Heartbeat timeout!");
                    if (Date.now() - this.recv_timestamp > 15000)
                        this.destroy();
                }
            }
        }, 60000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
    }

    async register() {
        try {
            if (!await wt.register.call(this))
                throw new Error();
        } catch (e) {
            this.logger.error("上线失败。");
            this.terminate();
            this.em("system.offline.network", {message: "register失败"});
            return;
        }
        this.status = Client.ONLINE;
        if (!this.online_status)
            this.online_status = 11;
        if (this.platform === 1)
            this.setOnlineStatus(this.online_status);
        this.startHeartbeat();
        if (!this.listenerCount("internal.kickoff")) {
            this.once("internal.kickoff", (data)=>{
                this.status = Client.INIT;
                this.stopHeartbeat();
                this.logger.warn(data.info);
                let sub_type;
                if (data.info.includes("另一")) {
                    sub_type = "kickoff";
                    if (this.config.kickoff) {
                        this.logger.info("3秒后重新连接..");
                        setTimeout(this.login.bind(this), 3000);
                    } else {
                        this.terminate();
                    }
                } else if (data.info.includes("冻结")) {
                    sub_type = "frozen";
                    this.terminate();
                } else if (data.info.includes("设备锁")) {
                    sub_type = "device";
                    this.terminate();
                } else {
                    sub_type = "unknown";
                    this.terminate();
                }
                this.em("system.offline." + sub_type, {message: data.info});
            });
        }
    }

    /**
     * @param {Function} fn 
     * @param {Array} params 
     */
    async useProtocol(fn, params) {
        if (!this.isOnline() || !this.sync_finished)
            return buildApiRet(104, null, {code: -1, message: "bot not online"});
        try {
            const rsp = await fn.apply(this, params);
            if (!rsp)
                return buildApiRet(1);
            if (rsp.result !== 0)
                return buildApiRet(102, null,
                    {
                        code: rsp.result,
                        message: rsp.emsg?rsp.emsg:getErrorMessage(fn, rsp.result)
                    }
                );
            else
                return buildApiRet(0, rsp.data);
        } catch (e) {
            if (e instanceof TimeoutError)
                return buildApiRet(103, null, {code: -1, message: "packet timeout"});
            return buildApiRet(100, null, {code: -1, message: e.message});
        }
    }

    em(name, data = {}) {
        const slice = name.split(".");
        const post_type = slice[0], sub_type = slice[2];
        const param = {
            self_id:    this.uin,
            time:       timestamp(),
            post_type:  post_type
        };
        const type_name = slice[0] + "_type";
        param[type_name] = slice[1];
        if (sub_type)
            param.sub_type = sub_type;
        Object.assign(param, data);
        const lv2_event = post_type + "." + slice[1];
        if (this.listenerCount(name))
            this.emit(name, param);
        else if (this.listenerCount(lv2_event))
            this.emit(lv2_event, param);
        else
            this.emit(post_type, param);
    }

    msgExists(from, type, seq, time) {
        if (timestamp() - time >= 60)
            return true;
        const id = [from, type, seq].join("-");
        const set = this.seq_cache.get(time);
        if (!set) {
            this.seq_cache.set(time, new Set([id]));
            return false;
        } else {
            if (set.has(id))
                return true;
            else
                set.add(id);
            return false;
        }
    }
    doCircle() {
        wt.exchangeEMP.call(this);
        if (Date.now() - this.send_timestamp > 120000)
            core.getMsg.call(this);
        for (let time of this.seq_cache.keys()) {
            if (timestamp() - time >= 60)
                this.seq_cache.delete(time);
            else
                break;
        }
    }
    calcMsgCnt() {
        let cnt = 0;
        for (let [time, set] of this.seq_cache) {
            if (timestamp() - time >= 60)
                this.seq_cache.delete(time);
            else
                cnt += set.size;
        }
        return cnt;
    }

    // 以下是public方法 ----------------------------------------------------------------------------------------------------

    login(password_md5) {
        if (this.isOnline())
            return;
        if (password_md5 || !this.password_md5) {
            try {
                if (typeof password_md5 === "string")
                    password_md5 = Buffer.from(password_md5, "hex");
                if (password_md5 instanceof Buffer && password_md5.length === 16)
                    this.password_md5 = password_md5;
                else
                    throw new Error("error");
            } catch (e) {
                throw new Error("Argument password_md5 is illegal.");
            }
        }
        this._connect(()=>{
            wt.passwordLogin.call(this);
        });
    }

    captchaLogin(captcha) {
        if (!this.captcha_sign)
            return this.logger.error("未收到图片验证码或已过期，你不能调用captchaLogin函数。");
        this._connect(()=>{
            wt.captchaLogin.call(this, captcha);
        });
    }

    terminate() {
        this.reconn_flag = false;
        this.destroy();
    }

    async logout() {
        if (this.isOnline) {
            try {
                await wt.register.call(this, true);
            } catch {}
        }
        this.terminate();
    }

    isOnline() {
        return this.status === Client.ONLINE;
    }

    async setOnlineStatus(status) {
        return await this.useProtocol(indi.setStatus, arguments);
    }

    getFriendList() {
        return buildApiRet(0, this.fl);
    }
    getStrangerList() {
        return buildApiRet(0, this.sl);
    }
    getGroupList() {
        return buildApiRet(0, this.gl);
    }

    async getGroupMemberList(group_id) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        if (!this.gml.has(group_id))
            this.gml.set(group_id, resource.getGML.call(this, group_id));
        let mlist = this.gml.get(group_id);
        if (mlist instanceof Promise)
            mlist = await mlist;
        if (mlist)
            return buildApiRet(0, mlist);
        return buildApiRet(102);
    }
    async getStrangerInfo(user_id, no_cache = false) {
        return await this.useProtocol(resource.getSI, arguments);
    }
    async getGroupInfo(group_id, no_cache = false) {
        return await this.useProtocol(resource.getGI, arguments);
    }
    async getGroupMemberInfo(group_id, user_id, no_cache = false) {
        return await this.useProtocol(resource.getGMI, arguments);
    }

    ///////////////////////////////////////////////////

    async sendPrivateMsg(user_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [user_id, message, auto_escape, 0]);
    }
    async sendGroupMsg(group_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [group_id, message, auto_escape, 1]);
    }
    async sendDiscussMsg(discuss_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [discuss_id, message, auto_escape, 2]);
    }
    async deleteMsg(message_id) {
        return await this.useProtocol(chat.recallMsg, arguments);
    }

    ///////////////////////////////////////////////////

    // async setGroupAnonymousBan(group_id, anonymous_flag, duration = 1800) {}
    async setGroupAnonymous(group_id, enable = true) {
        return await this.useProtocol(troop.setAnonymous, arguments);
    }
    async setGroupWholeBan(group_id, enable = true) {
        return await this.setGroupSetting(group_id, "shutupTime", enable?0xffffffff:0);
    }
    async setGroupName(group_id, group_name) {
        return await this.setGroupSetting(group_id, "ingGroupName", String(group_name));
    }
    async sendGroupNotice(group_id, content) {
        return await this.setGroupSetting(group_id, "ingGroupMemo", String(content));
    }
    async setGroupSetting(group_id, k, v) {
        return await this.useProtocol(troop.doSetting, arguments);
    }
    async setGroupAdmin(group_id, user_id, enable = true) {
        return await this.useProtocol(troop.setAdmin, arguments);
    }
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {
        return await this.useProtocol(troop.setTitle, arguments);
    }
    async setGroupCard(group_id, user_id, card = "") {
        return await this.useProtocol(troop.setCard, arguments);
    }
    async setGroupKick(group_id, user_id, reject_add_request = false) {
        return await this.useProtocol(troop.kickMember, arguments);
    }
    async setGroupBan(group_id, user_id, duration = 1800) {
        return await this.useProtocol(troop.muteMember, arguments);
    }
    async setGroupLeave(group_id, is_dismiss = false) {
        return await this.useProtocol(troop.quitGroup, arguments);
    }
    async sendGroupPoke(group_id, user_id) {
        return await this.useProtocol(troop.pokeMember, arguments);
    }

    ///////////////////////////////////////////////////

    async setFriendAddRequest(flag, approve = true, remark = "", block = false) {
        return await this.useProtocol(sysmsg.friendAction, arguments);
    }
    async setGroupAddRequest(flag, approve = true, reason = "", block = false) {
        return await this.useProtocol(sysmsg.groupAction, arguments);
    }

    async addGroup(group_id, comment = "") {
        return await this.useProtocol(troop.addGroup, arguments);
    }
    async addFriend(group_id, user_id, comment = "") {
        return await this.useProtocol(indi.addFriend, arguments);
    }
    async deleteFriend(user_id, block = true) {
        return await this.useProtocol(indi.delFriend, arguments);
    }
    async inviteFriend(group_id, user_id) {
        return await this.useProtocol(troop.inviteFriend, arguments);
    }

    async sendLike(user_id, times = 1) {
        return await this.useProtocol(indi.sendLike, arguments);
    }
    async setNickname(nickname) {
        return await this.useProtocol(indi.setProfile, [0x14E22, String(nickname)]);
    }
    async setDescription(description = "") {
        return await this.useProtocol(indi.setProfile, [0x14E33, String(description)]);
    }
    async setGender(gender) {
        gender = parseInt(gender);
        if (![0,1,2].includes(gender))
            return buildApiRet(100);
        return await this.useProtocol(indi.setProfile, [0x14E29, Buffer.from([gender])]);
    }
    async setBirthday(birthday) {
        try {
            birthday = String(birthday).replace(/[^\d]/g, "");
            const buf = Buffer.alloc(4);
            buf.writeUInt16BE(parseInt(birthday.substr(0, 4)));
            buf.writeUInt8(parseInt(birthday.substr(4, 2)), 2);
            buf.writeUInt8(parseInt(birthday.substr(6, 2)), 3);
            return await this.useProtocol(indi.setProfile, [0x16593, buf]);
        } catch (e) {
            return buildApiRet(100);
        }
    }
    async setSignature(signature = "") {
        return await this.useProtocol(indi.setSign, arguments);
    }
    async setPortrait(file) {
        return await this.useProtocol(indi.setPortrait, arguments);
    }
    async setGroupPortrait(group_id, file) {
        return await this.useProtocol(indi.setGroupPortrait, arguments);
    }

    ///////////////////////////////////////////////////

    async getCookies(domain) {
        await wt.exchangeEMP.call(this);
        if (domain && !this.cookies[domain])
            return buildApiRet(100, null, {code: -1, message: "unknown domain"});
        let cookies = `uin=o${this.uin}; skey=${this.sig.skey};`;
        if (domain)
            cookies = `${cookies} p_uin=o${this.uin}; p_skey=${this.cookies[domain]};`;
        return buildApiRet(0, {cookies});
    }

    async getCsrfToken() {
        await wt.exchangeEMP.call(this);
        let token = 5381;
        for (let v of this.sig.skey)
            token = token + (token << 5) + v;
        token &= 2147483647;
        return buildApiRet(0, {token});
    }

    /**
     * @param {String} type "image" or "record" or undefined
     */
    async cleanCache(type = "") {
        switch (type) {
            case "image":
            case "record":
                const file = path.join(this.dir, "..", type, "*");
                const cmd = os.platform().includes("win") ? `del /q ` : `rm -f `;
                spawn.exec(cmd + file, (err, stdout, stderr)=>{
                    if (err)
                        return this.logger.error(err);
                    if (stderr)
                        return this.logger.error(stderr);
                    this.logger.info(type + " cache clear");
                });
                break;
            case "":
                this.cleanCache("image");
                this.cleanCache("record");
                break;
            default:
                return buildApiRet(100, null, {code:-1, message:"unknown type (image, record, or undefined)"});
        }
        return buildApiRet(1);
    }

    canSendImage() {
        return buildApiRet(0, {yes: true});
    }
    canSendRecord() {
        return buildApiRet(0, {yes: true});
    }
    getVersionInfo() {
        return buildApiRet(0, version);
    }
    getStatus() {
        return buildApiRet(0, {
            online: this.isOnline(),
            status: this.online_status,
            msg_cnt_per_min: this.calcMsgCnt(),
            statistics: this.stat,
        })
    }
    getLoginInfo() {
        return buildApiRet(0, {
            user_id: this.uin,
            nickname: this.nickname,
            age: this.age, sex: this.sex
        })
    }
}

/**
 * @deprecated
 */
const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";
process.OICQ = {
    logger
};

console.log("OICQ程序启动。当前内核版本：v" + version.version);

function createDataDir(dir, uin) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, {mode: 0o755, recursive: true});
    const img_path = path.join(dir, "image");
    const ptt_path = path.join(dir, "record");
    const uin_path = path.join(dir, String(uin));
    if (!fs.existsSync(img_path))
        fs.mkdirSync(img_path);
    if (!fs.existsSync(ptt_path))
        fs.mkdirSync(ptt_path);
    if (!fs.existsSync(uin_path))
        fs.mkdirSync(uin_path, {mode: 0o755});
    return uin_path;
}

/**
 * @deprecated
 */
function setGlobalConfig() {}

//----------------------------------------------------------------------------------------------------

/**
 * @param {Number} uin 
 * @param {JSON} config 
 * @returns {AndroidClient}
 */
function createClient(uin, config = {}) {
    uin = parseInt(uin);
    if (!checkUin(uin))
        throw new Error("Argument uin is not an OICQ account.");
    if (typeof config !== "object" || config === null)
        throw new Error("Argument config is illegal.");
    return new AndroidClient(uin, config);
}

module.exports = {
    createClient, setGlobalConfig
};
