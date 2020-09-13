"use strict";
const version = require("./package.json");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const log4js = require("log4js");
const device = require("./lib/device");
const {rand, buildApiRet, checkUin, timestamp} = require("./lib/common");
const outgoing = require("./lib/outgoing");
const imcoming = require("./lib/incoming");
const event = require("./lib/event");
const BUF0 = Buffer.alloc(0);

class OICQError extends Error {};

const server_list = [
    {ip:"msfwifi.3g.qq.com",port:8080,ping:null},
];

/**
 * @link https://nodejs.org/dist/latest/docs/api/net.html#net_class_net_socket
 */
class Client extends net.Socket {
    static OFFLINE = Symbol("OFFLINE");
    static INIT = Symbol("INIT");
    static ONLINE = Symbol("ONLINE");
}

/*** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * @事件 事件为冒泡传递，例如request.group.add事件，若未监听会沿着request.group传递到request
 * 
 * 聊天应用事件
 * @event message 消息类(cqhttp风格命名和参数)
 *  @event message.private
 *      @event message.private.friend
 *      @event message.private.single 单向好友，对方未加你
 *      @event message.private.group
 *      @event message.private.other
 *  @event message.group
 *      @event message.group.normal
 *      @event message.group.anonymous
 *      @event message.group.notice
 * @event request 请求类(cqhttp风格命名和参数)
 *  @event request.friend
 *      @event request.friend.add
 *  @event request.group
 *      @event request.group.add
 *      @event request.group.invite
 * @event notice 通知类(命名与cqhttp略不同，统一了风格)
 *  @event notice.friend
 *      @event notice.friend.increase
 *      @event notice.friend.decrease
 *      @event notice.friend.recall
 *  @event notice.group
 *      @event notice.group.upload
 *      @event notice.group.admin       管理变动(新增布尔型字段set)
 *      @event notice.group.transfer    群主转让(有old_owner和new_owner字段)
 *      @event notice.group.recall
 *      @event notice.group.ban         禁言(通过duration判断是解禁还是禁言)
 *      @event notice.group.config      群设置变更
 *      @event notice.group.card        群名片变更
 *      @event notice.group.increase    群员增加(新增布尔型字段invite)
 *      @event notice.group.decrease    群员减少(通过operator_id判断是退群还是踢出)
 * 
 * 系统事件
 * @event system
 *  @event system.login
 *      @event system.login.captcha 验证码需要处理 {image}
 *      @event system.login.device 设备锁需要处理(暂不支持区分真假设备锁) {url}
 *      @event system.login.error 登陆失败 {message}
 *  @event system.online 上线(可以开始处理消息)
 *  @event system.offline 下线(无法自动重新登陆的时候，有下列情况)
 *      @event system.offline.network 拔线
 *      @event system.offline.frozen 账号冻结
 *      @event system.offline.kickoff 被挤下线
 *      @event system.offline.unknown 未知领域
 * 
 * 内部事件(一般无需监听)
 * @event internal
 *  @event internal.login login成功
 *  @event internal.kickoff 被强制下线
 *  @event internal.exception 内部异常情况
 *  @event internal.timeout 回包响应超时
 * 
 * 网络层事件(请勿随意监听，否则可能导致系统运行不正常)
 * @event pause,readable,finish,pipe,unpipe
 * @event close,connect,data,drain,end,error,lookup,ready,timeout
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * @公开API 使用CQHTTP风格的命名和参数(函数使用驼峰非下划线)
 * 
 * @method sendPrivateMsg
 * @method sendGroupMsg
 * @method sendMsg
 * @method deleteMsg
 * @method getMsg
 * @method getForwardMsg
 * @method sendLike
 * @method setGroupKick
 * @method setGroupBan
 * @method setGroupAnonymousBan
 * @method setGroupWholeBan
 * @method setGroupAdmin
 * @method setGroupAnonymous
 * @method setGroupCard
 * @method setGroupName
 * @method setGroupLeave
 * @method setGroupSpecialTitle
 * @method setFriendAddRequest
 * @method setGroupAddRequest
 * @method getLoginInfo
 * @method getStrangerInfo
 * @method getFriendList
 * @method getGroupInfo
 * @method getGroupList
 * @method getGroupMemberInfo
 * @method getGroupMemberList
 * @method getGroupHonorInfo
 * @method getCookies
 * @method getCsrfToken
 * @method getCredentials
 * @method getRecord
 * @method getImage
 * @method canSendImage
 * @method canSendRecord
 * @method getStatus
 * @method getVersionInfo
 * @method setRestart
 * @method cleanCache
 * 
 * @具体实现程度请参照README
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 */
class AndroidClient extends Client {
    reconn_flag = true;
    logger;
    config;
    status = Client.OFFLINE;
    kickoff_reconn = false;

    uin = 0;
    password_md5;
    // appid = 16;
    sub_appid;
    ignore_self = true;

    nickname = "";
    age = 0;
    gender = 0;
    online_status = 0;
    friend_list = new Map();
    friend_list_lock = false;
    friend_list_uptime = 0;
    group_list = new Map();
    group_list_lock = false;
    group_list_uptime = 0;
    group_member_list = new Map();
    member_list_lock = new Set();

    recv_timestamp = 0;
    send_timestamp = 0xffffffff;
    heartbeat = null;
    seq_id = 0;
    handlers = new Map();
    seq_cache = {
        "PbPush": new Set(),
        "ReqPush": new Set(),
    };

    session_id = Buffer.from([0x02, 0xB0, 0x5B, 0x8B]);
    random_key = crypto.randomBytes(16);
    ksid = Buffer.from("|454001228437590|A8.2.7.27f6ea96");
    device_info;
    captcha_sign;

    sign_info = {
        bitmap: 0,
        tgt: BUF0,
        tgt_key: BUF0,
        st_key: BUF0,
        st_web_sig: BUF0,
        s_key: BUF0,
        d2: BUF0,
        d2key: BUF0,
        ticket_key: BUF0,
        device_token: BUF0,
    };

    time_diff;
    rollback_sig;
    t104;
    t149;
    t150;
    t528;
    t530;
    pwd_flag;

    sync_finished = false;
    sync_cookie;
    sync_lock = false;

    const1 = rand(9);
    const2 = rand(9);
    curr_msg_id;
    curr_msg_rand;

    /**
     * @constructor
     * @param {Number} uin
     * @param {Object} config 
     */
    constructor(uin, config = {}) {
        super();
        this.uin = uin;

        config = {
            platform:    2,      //1手机 2平板 3手表(不支持部分群事件)
            log_level:   "info", //trace,debug,info,warn,error,fatal,off
            kickoff:     false,  //被挤下线是否在3秒后反挤对方
            ignore_self: true,   //群聊是否无视自己的发言
            device_path: path.join(process.mainModule.path, "data"),    //设备文件保存路径，默认为启动文件同目录下的data文件夹
            ...config
        };
        this.config = config;

        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        this.sub_appid = config.platform === 1 ? 537062845 : (config.platform === 3 ? 537061176 : 537062409);
        this.ignore_self = config.ignore_self;
        this.kickoff_reconn = config.kickoff;

        const filepath = path.join(config.device_path, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device_info = device(filepath);

        this.on("error", (err)=>{
            this.logger.error(err.message);
        });
        this.on("close", (e_flag)=>{
            if (this.remoteAddress)
                this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.stopHeartbeat();
            if (this.status === Client.OFFLINE) {
                this.logger.error("网络不通畅。");
                return event.emit(this, "system.offline.network");
            }
            this.status = Client.OFFLINE;
            if (this.reconn_flag) {
                if (e_flag)
                    this.reconn_flag = false;
                this._connect(()=>{
                    this.changeOnlineStatus(this.online_status?this.online_status:11);
                });
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
                    (async()=>{
                        try {
                            imcoming(packet, this);
                        } catch (e) {
                            this.logger.debug(e.stack);
                            this.emit("internal.exception", e);
                        }
                    })();
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        })

        this.on("internal.login", async()=>{
            this.logger.info(`Welcome, ${this.nickname} ! 开始初始化资源...`);
            this.sync_finished = false;
            await this.changeOnlineStatus();
            if (!this.isOnline())
                return;
            await Promise.all([
                this.getFriendList(true), this.getGroupList(true)
            ]);
            this.logger.info(`加载了${this.friend_list.size}个好友，${this.group_list.size}个群。`);
            this.write(outgoing.buildGetMessageRequestPacket(0, this));
            let n = 0, tasks = [];
            for (let k of this.group_list.keys()) {
                ++n;
                tasks.push(this.getGroupMemberList(k, true));
                if (n % 10 === 0) {
                    await Promise.all(tasks);
                    tasks = [];
                }
            }
        });
    }

    /**
     * @private
     * @param {Function} callback 
     */
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

    /**
     * @private
     * @returns {Number} this.seq_id
     */
    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1;
        return this.seq_id;
    }

    /**
     * @private
     * @async reject if retcode=1
     * @param {Buffer} packet
     * @param {Number} timeout ms
     * @returns {OICQResponse}
     */
    async send(packet, timeout = 3000) {
        const seq_id = this.seq_id;
        return new Promise((resolve, reject)=>{
            this.write(packet, ()=>{
                const id = setTimeout(()=>{
                    this.handlers.delete(seq_id);
                    reject({message: "timeout"});
                    event.emit(this, "internal.timeout", {seq_id});
                }, timeout);
                this.handlers.set(seq_id, (data)=>{
                    clearTimeout(id);
                    this.handlers.delete(seq_id);
                    resolve(data);
                });
            });
        });
    }

    /**
     * @private
     */
    startHeartbeat() {
        if (this.heartbeat)
            return;
        this.heartbeat = setInterval(async()=>{
            if (Date.now() - this.send_timestamp > 300000)
                this.write(outgoing.buildGetMessageRequestPacket(0, this));
            try {
                await this.send(outgoing.buildHeartbeatRequestPacket(this));
            } catch (e) {
                this.logger.warn("Heartbeat timeout!");
                if (Date.now() - this.recv_timestamp > 10000)
                    this.destroy();
            }
        }, 30000);
        this.write(outgoing.buildHeartbeatRequestPacket(this));
    }
    /**
     * @private
     */
    stopHeartbeat() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
    }

    /**
     * @private
     * @param {Number} user_id 
     * @returns {Boolean}
     */
    async hasFriend(user_id) {
        if (!this.friend_list.has(user_id))
            await this.getFriendList(true);
        return this.friend_list.has(user_id);
    }
    /**
     * @private
     * @param {Number} group_id 
     * @returns {Boolean}
     */
    async hasGroup(group_id) {
        if (!this.group_list.has(group_id))
            await this.getGroupList(true);
        return this.group_list.has(group_id);
    }
    /**
     * @private
     * @param {Number} user_id 
     * @returns {Map|void}
     */
    findStranger(user_id) {
        if (this.friend_list.has(user_id))
            return this.friend_list.get(user_id);
        for (const [k, v] of this.group_member_list) {
            if (v.has(user_id))
                return v.get(user_id);
        }
    }

    // 以下是public方法 ----------------------------------------------------------------------------------------------------

    /**
     * 密码登陆
     * @param {Buffer|String|undefined} password_md5 这里不传递明文密码
     */
    login(password_md5) {
        if (this.isOnline())
            return;
        if (password_md5) {
            try {
                if (typeof password_md5 === "string")
                    password_md5 = Buffer.from(password_md5, "hex");
                if (password_md5 instanceof Buffer && password_md5.length === 16)
                    this.password_md5 = password_md5;
                else
                    throw new Error("error");
            } catch (e) {
                throw new OICQError("Argument password_md5 is illegal.");
            }
        }
        this._connect(()=>{
            this.write(outgoing.buildPasswordLoginRequestPacket(this));
        });
    }

    /**
     * 验证码登陆
     * @param {String} captcha 
     */
    captchaLogin(captcha = "abcd") {
        if (this.isOnline())
            return;
        try {
            captcha = captcha.toString().trim();
        } catch (e) {
            throw new OICQError("Illegal argument type.");
        }
        const packet = outgoing.buildCaptchaLoginRequestPacket(
            Buffer.byteLength(captcha) === 4 ? captcha : "abcd", this.captcha_sign, this
        );
        this.write(packet);
    }

    /**
     * @param {Number} status 11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
     */
    async changeOnlineStatus(status = 11) {
        status = parseInt(status);
        if (![11, 31, 41, 50, 60, 70].includes(status))
            return buildApiRet(100);
        try {
            if (!await this.send(outgoing.buildClientRegisterRequestPacket(status, this)))
                throw new Error();
        } catch (e) {
            if (!this.isOnline()) {
                this.logger.error("上线失败，未知情况。");
                this.terminate();
                event.emit(this, "system.offline.unknown");
            }
            return buildApiRet(102);
        }
        this.status = Client.ONLINE;
        this.online_status = status;
        this.startHeartbeat();
        if (!this.listenerCount("internal.kickoff")) {
            this.once("internal.kickoff", (data)=>{
                this.status = Client.INIT;
                this.online_status = 0;
                this.stopHeartbeat();
                this.logger.warn(data.info);
                let sub_type;
                if (data.info.includes("另一")) {
                    sub_type = "kickoff";
                    if (this.kickoff_reconn) {
                        this.logger.info("3秒后重新连接..");
                        setTimeout(this.login.bind(this), 3000);
                    } else {
                        this.terminate();
                    }
                } else if (data.info.includes("冻结")) {
                    sub_type = "frozen";
                    this.terminate();
                } else {
                    sub_type = "unknown";
                    this.terminate();
                }
                event.emit(this, "system.offline." + sub_type);
            })
        }
        return buildApiRet(0);
    }

    /**
     * 使用此函数关闭连接，不要使用end和destroy
     */
    terminate() {
        this.reconn_flag = false;
        this.destroy();
    }

    isOnline() {
        return this.status === Client.ONLINE;
    }

    ///////////////////////////////////////////////////

    /**
     * 返回值的形式为
     *  {
     *      retcode: 0,     //0正常 1异步 100参数错误 102调用失败 103超时
     *      status: "ok",   //ok正常 async异步 failed失败
     *      data:null,      //数据，类型可能是Object或Map
     *      error: ""       //错误信息，偶尔会有
     *  }
     * 之后的 @returns 指的都是成功时的data字段
     * 
     * @param {Boolean} no_cache Default: false
     * @returns {Map} data <this.friend_list>
     */
    async getFriendList(no_cache = false) {
        if (no_cache && !this.friend_list_lock) {
            try {
                this.friend_list_lock = true;
                this.friend_list = new Map();
                let start = 0, limit = 250;
                while (1) {
                    const total = await this.send(outgoing.buildFriendListRequestPacket(start, limit, this));
                    start += limit;
                    if (start > total) break;
                }
                this.friend_list_uptime = timestamp();
            } catch (e) {}
            this.friend_list_lock = false;
        }
        return buildApiRet(0, this.friend_list);
    }

    /**
     * @param {Boolean} no_cache Default: false
     * @returns {Map} data <this.group_list>
     */
    async getGroupList(no_cache = false) {
        if (no_cache && !this.group_list_lock) {
            try {
                this.group_list_lock = true;
                await this.send(outgoing.buildGroupListRequestPacket(this));
                this.group_list_uptime = timestamp();
            } catch (e) {}
            this.group_list_lock = false;
        }
        return buildApiRet(0, this.group_list);
    }

    /**
     * @param {Number} group_id
     * @param {Boolean} no_cache Default: false
     * @returns {Map} data <this.group_member_list.get(group_id)>
     */
    async getGroupMemberList(group_id, no_cache = false) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        if (!await this.hasGroup(group_id)) {
            this.group_member_list.delete(group_id);
            return buildApiRet(102);
        }
        if (!this.member_list_lock.has(group_id) && (no_cache || !this.group_member_list.has(group_id))) {
            try {
                this.member_list_lock.add(group_id);
                let next = 0;
                this.group_member_list.set(group_id, new Map());
                while (1) {
                    next = await this.send(outgoing.buildGroupMemberListRequestPacket(group_id, next, this));
                    if (!next) break;
                }
            } catch (e) {}
            this.member_list_lock.delete(group_id);
        }
        if (!this.group_member_list.has(group_id))
            return buildApiRet(102);
        return buildApiRet(0, this.group_member_list.get(group_id));
    }

    /**
     * @param {Number} user_id 
     * @returns {Ojbect} data
     */
    async getStrangerInfo(user_id) {
        user_id = parseInt(user_id);
        if (!checkUin(user_id))
            return buildApiRet(100);
        const stranger = this.findStranger(user_id);
        if (stranger)
            return buildApiRet(0, stranger);
        return buildApiRet(102);
    }

    /**
     * @param {Number} group_id
     * @param {Boolean} no_cache Default: false
     * @returns {Ojbect} data
     */
    async getGroupInfo(group_id, no_cache = false) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        if (no_cache || !this.group_list.has(group_id))
            await this.getGroupList(true);
        const group = this.group_list.get(group_id);
        if (group)
            return buildApiRet(0, group);
        return buildApiRet(102);
    }

    /**
     * @param {Number} group_id
     * @param {Number} user_id
     * @param {Boolean} no_cache Default: false
     * @returns {Ojbect} data
     */
    async getGroupMemberInfo(group_id, user_id, no_cache = false) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        if (no_cache || !this.group_member_list.has(group_id) || !this.group_member_list.get(group_id).has(user_id))
            await this.getGroupMemberList(group_id, true);
        try {
            const member = this.group_member_list.get(group_id).get(user_id);
            if (member) 
                return buildApiRet(0, member);
        } catch (e) {}
        return buildApiRet(102);
    }

    ///////////////////////////////////////////////////

    /**
     * @param {Number} user_id 
     * @param {String|Array} message 
     * @param {Boolean} auto_escape Default: false
     * @returns {Ojbect} data
     *  @field {Number} message_id
     */
    async sendPrivateMsg(user_id, message = "", auto_escape = false) {
        user_id = parseInt(user_id);
        if (!checkUin(user_id))
            return buildApiRet(100);
        try {
            try {
                var packet = await outgoing.commonMessage(user_id, message, auto_escape, false, false, this);
            } catch (e) {
                this.logger.debug(e);
                return buildApiRet(100);
            }
            let message_id = this.curr_msg_id;
            const resp = await this.send(packet);
            if (resp.result === 0) {
                const buf = Buffer.alloc(4);
                buf.writeUInt32BE(resp.sendTime);
                message_id += buf.toString("hex");
                this.logger.info(`send to: [Private: ${user_id}] ` + message);
                return buildApiRet(0, {message_id});
            }
            this.logger.error(`send failed: [Private: ${user_id}] ` + resp.errmsg)
            return buildApiRet(102, null, {info: resp.errmsg});
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {Number} group_id 
     * @param {String|Array} message 
     * @param {Boolean} auto_escape Default: false
     * @param {Boolean} as_long 作为长消息发送(可以避免被风控)
     * @returns {Ojbect} data
     *  @field {Number} message_id
     */
    async sendGroupMsg(group_id, message = "", auto_escape = false, as_long = false) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        try {
            try {
                var packet = await outgoing.commonMessage(group_id, message, auto_escape, true, as_long, this);
            } catch (e) {
                this.logger.debug(e);
                return buildApiRet(100);
            }

            // 注册监听器，监听这条自己的发言
            var event_id = `interval.${group_id}.${this.curr_msg_rand}`;
            let message_id;
            this.once(event_id, (id)=>message_id=id);

            const resp = await this.send(packet);

            if (resp.result !== 0) {
                this.removeAllListeners(event_id);
                this.logger.error(`send failed: [Group: ${group_id}] ` + resp.errmsg);
                return buildApiRet(102, null, {info: resp.errmsg});
            }

            if (this.listenerCount(event_id) > 0) {
                this.removeAllListeners(event_id);
                message_id = await new Promise((resolve)=>{
                    const id = setTimeout(()=>{
                        this.removeAllListeners(event_id);
                        if (!as_long)
                            resolve(false);
                        else
                            resolve(group_id.toString(16) + "0".repeat(16));
                    }, 300);
                    this.once(event_id, (a)=>{
                        clearTimeout(id);
                        resolve(a);
                    });
                });
                if (!message_id) {
                    this.logger.warn(`可能被风控了，将尝试作为长消息再发送一次。`);
                    return await this.sendGroupMsg(group_id, message, auto_escape, true);
                }
            };

            this.logger.info(`send to: [Group: ${group_id}] ` + message);
            return buildApiRet(0, {message_id});
        } catch (e) {
            this.removeAllListeners(event_id);
            return buildApiRet(103);
        }
    }

    /**
     * @param {String} message_id hex字符串
     */
    async deleteMsg(message_id) {
        try {
            if (message_id.length === 24)
                this.write(outgoing.buildGroupRecallRequestPacket(message_id, this));
            else
                this.write(outgoing.buildFriendRecallRequestPacket(message_id, this));
        } catch (e) {
            return buildApiRet(100);
        }
        return buildApiRet(1);
    }

    ///////////////////////////////////////////////////

    //todo
    // async setGroupAnonymous(group_id, enable = true) {}
    // async setGroupAnonymousBan(group_id, anonymous_flag,  duration = 600) {}
    // async setGroupWholeBan(group_id, enable = true) {}
    async setGroupName(group_id, group_name = "") {
        this.write(outgoing.buildGroupSettingRequestPacket(group_id, "ingGroupName", Buffer.from(String(group_name)), this));
        return buildApiRet(1);
    }
    async sendGroupNotice(group_id, content = "") {
        this.write(outgoing.buildGroupSettingRequestPacket(group_id, "ingGroupMemo", Buffer.from(String(content)), this));
        return buildApiRet(1);
    }
    // async setGroup(group_id, k, v) {
    //     this.write(outgoing.buildGroupSettingRequestPacket(group_id, k, v, this));
    //     return buildApiRet(1);
    // }
    async setGroupAdmin(group_id, user_id, enable = true) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildSetGroupAdminRequestPacket(group_id, user_id, enable, this));
            if (res) {
                try {
                    const old_role = this.group_member_list.get(group_id).get(user_id).role;
                    const new_role = enable ? "admin" : "member";
                    if (old_role !== new_role && old_role !== "owner") {
                        this.group_member_list.get(group_id).get(user_id).role = new_role;
                        event.emit(this, "notice.group.admin", {
                            group_id, user_id, set: !!enable
                        });
                    }
                } catch (e) {}
            }
            return buildApiRet(res?0:102);
        } catch (e) {
            return buildApiRet(103);
        }
    }
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildEditSpecialTitleRequestPacket(group_id, user_id, special_title, duration, this));
            return buildApiRet(res?0:102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    ///////////////////////////////////////////////////

    /**
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {String} card 为空还原
     */
    async setGroupCard(group_id, user_id, card = "") {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildEditGroupCardRequestPacket(group_id, user_id, card, this));
            return buildApiRet(res?0:102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {Boolean} reject_add_request 
     */
    async setGroupKick(group_id, user_id, reject_add_request = false) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            if (await this.send(outgoing.buildGroupKickRequestPacket(group_id, user_id, reject_add_request, this))) {
                if (this.group_member_list.get(group_id).delete(user_id)) {
                    event.emit(this, "notice.group.decrease", {
                        group_id, user_id,
                        operator_id: this.uin,
                        dismiss: false
                    });
                }
                return buildApiRet(0);
            }
            return buildApiRet(102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {Number} duration 秒数
     */
    async setGroupBan(group_id, user_id, duration = 1800) {
        group_id = parseInt(group_id), user_id = parseInt(user_id), duration = parseInt(duration);
        if (!checkUin(group_id) || !checkUin(user_id) || !(duration >= 0 && duration <= 2592000))
            return buildApiRet(100);
        this.write(outgoing.buildGroupBanRequestPacket(group_id, user_id, duration, this));
        return buildApiRet(1);
    }

    /**
     * @param {Number} group_id 
     * @param {Boolean} is_dismiss 暂未实现解散
     */
    async setGroupLeave(group_id, is_dismiss = false) {
        try {
            group_id = parseInt(group_id);
            if (!checkUin(group_id))
                return buildApiRet(100);
            const res = await this.send(outgoing.buildGroupLeaveRequestPacket(group_id, this));
            return buildApiRet(res === 0 ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {Number} group_id 
     * @param {Number} user_id
     */
    async sendGroupPoke(group_id, user_id) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        this.write(outgoing.buildGroupPokeRequestPacket(group_id, user_id, this));
        return buildApiRet(1);
    }

    ///////////////////////////////////////////////////

    /**
     * @param {String} flag 
     * @param {Boolean} approve 
     * @param {String} remark
     * @param {Boolean} block 是否加入黑名单
     * @async 暂时为立即返回，无法知晓是否成功
     */
    async setFriendAddRequest(flag, approve = true, remark = "", block = false) {
        try {
            this.write(outgoing.buildFriendRequestRequestPacket(flag, approve, block, this));
            return buildApiRet(1);
        } catch (e) {}
        return buildApiRet(100);
    }

    /**
     * @param {String} flag 
     * @param {Boolean} approve 
     * @param {String} reason 拒绝理由，仅在拒绝他人加群时有效
     * @param {Boolean} block 是否加入黑名单
     * @async 暂时为立即返回，无法知晓是否成功
     */
    async setGroupAddRequest(flag, approve = true, reason = "", block = false) {
        try {
            this.write(outgoing.buildGroupRequestRequestPacket(flag, approve, reason, block, this));
            return buildApiRet(1);
        } catch (e) {}
        return buildApiRet(100);
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
        })
    }
    getLoginInfo() {
        return buildApiRet(0, {
            user_id: this.uin,
            nickname: this.nickname,
            age: this.age, sex: this.gender
        })
    }
}

//----------------------------------------------------------------------------------------------------

const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";

const config = {
    web_image_timeout:  0,  //下载网络图片的超时时间
    web_record_timeout: 0,  //下载网络语音的超时时间
    cache_root:         path.join(process.mainModule.path, "data"), //缓存文件夹根目录，需要可写权限
    debug: false,
};

process.OICQ = {
    logger, config
};

function createRootDir() {
    try {
        if (!fs.existsSync(config.cache_root))
            fs.mkdirSync(config.cache_root);
        const img_path = path.join(config.cache_root, "image");
        const ptt_path = path.join(config.cache_root, "record");
        if (!fs.existsSync(img_path))
            fs.mkdirSync(img_path);
        if (!fs.existsSync(ptt_path))
            fs.mkdirSync(ptt_path);
    } catch (e) {
        logger.error("创建数据文件夹失败，请确认权限。" + config.cache_root);
    }
}

createRootDir();

/**
 * 全局设置
 */
function setGlobalConfig(config = {}) {
    Object.assign(process.OICQ.config, config);
    if (config.debug)
        logger.level = "debug";
    createRootDir();
}

/**
 * @param {Number} uin 
 * @param {Object} config 
 * @returns {AndroidClient}
 */
function createClient(uin, config = {}) {
    uin = parseInt(uin);
    if (!checkUin(uin))
        throw new OICQError("Argument uin is not an OICQ account.");
    if (typeof config !== "object" || config === null)
        throw new OICQError("Argument config is illegal.");
    return new AndroidClient(uin, config);
}

module.exports = {
    createClient, setGlobalConfig
};
