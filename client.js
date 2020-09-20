"use strict";
const version = require("./package.json");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const log4js = require("log4js");
const device = require("./lib/device");
const {buildApiRet, checkUin, timestamp} = require("./lib/common");
const outgoing = require("./lib/outgoing");
const imcoming = require("./lib/incoming");
const event = require("./lib/event");
const BUF0 = Buffer.alloc(0);

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
 *      @event system.offline.device 由于开启设备锁，需要重新验证
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

    const1 = crypto.randomBytes(4).readUInt32BE();
    const2 = crypto.randomBytes(4).readUInt32BE();
    curr_msg_id;
    curr_msg_rand;

    dir;

    /**
     * @constructor
     * @param {Number} uin
     * @param {Object} config 
     */
    constructor(uin, config = {}) {
        super();
        this.uin = uin;
        this.dir = createCacheDir(uin);

        config = {
            platform:    2,      //1手机 2平板 3手表(不支持部分群事件)
            log_level:   "info", //trace,debug,info,warn,error,fatal,off
            kickoff:     false,  //被挤下线是否在3秒后反挤对方
            ignore_self: true,   //群聊是否无视自己的发言
            ...config
        };
        this.config = config;

        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        this.sub_appid = config.platform === 1 ? 537062845 : (config.platform === 3 ? 537061176 : 537062409);
        this.ignore_self = config.ignore_self;
        this.kickoff_reconn = config.kickoff;

        const filepath = path.join(this.dir, `device-${uin}.json`);
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
                    this.register();
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
            this.sync_cookie = null;
            this.sync_finished = false;
            await this.register();
            if (!this.isOnline())
                return;
            const getFriendList = async()=>{
                let start = 0;
                while (1) {
                    const total = await this.send(outgoing.buildFriendListRequestPacket(start, this));
                    start += 150;
                    if (start > total) break;
                }
            }
            await Promise.all([
                getFriendList(),
                this.send(outgoing.buildGroupListRequestPacket(this))
            ]);
            this.logger.info(`加载了${this.fl.size}个好友，${this.gl.size}个群。`);
            this.write(outgoing.buildGetMessageRequestPacket(0, this));
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

    async register() {
        try {
            if (!await this.send(outgoing.buildClientRegisterRequestPacket(this)))
                throw new Error();
        } catch (e) {
            this.logger.error("上线失败，未知情况。");
            this.terminate();
            event.emit(this, "system.offline.unknown");
            return;
        }
        this.status = Client.ONLINE;
        if (!this.online_status)
            this.online_status = 11;
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
                    if (this.kickoff_reconn) {
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
                event.emit(this, "system.offline." + sub_type);
            });
        }
    }

    /**
     * @private
     * @param {Number} group_id
     */
    async _getGroupMemberList(group_id) {
        let mlist = new Map();
        try {
            var next = 0;
            while (1) {
                var {map, next} = await this.send(outgoing.buildGroupMemberListRequestPacket(group_id, next, this));
                mlist = new Map([...mlist, ...map]);
                if (!next) break;
            }
        } catch (e) {}
        if (!mlist.size) {
            this.gml.delete(group_id);
            return null;
        } else {
            this.gml.set(group_id, mlist);
            return mlist;
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
                throw new Error("Argument password_md5 is illegal.");
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
            throw new Error("Illegal argument type.");
        }
        const packet = outgoing.buildCaptchaLoginRequestPacket(
            Buffer.byteLength(captcha) === 4 ? captcha : "abcd", this.captcha_sign, this
        );
        this.write(packet);
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
     * 设置在线状态 仅支持手机协议
     * @param {Number} status 11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
     */
    async setOnlineStatus(status) {
        if (this.config.platform !== 1)
            return buildApiRet(102);
        status = parseInt(status);
        if (![11, 31, 41, 50, 60, 70].includes(status))
            return buildApiRet(100);
        try {
            await this.send(outgoing.buildChangeStatusRequestPacket(status, this));
        } catch (e) {
            return buildApiRet(103);
        }
        this.online_status = status;
        return buildApiRet(0);
    }

    ///////////////////////////////////////////////////

    /**
     * 好友列表、陌生人列表、群列表
     * @returns {Map}
     */
    getFriendList() {
        return buildApiRet(0, this.fl);
    }
    getStrangerList() {
        return buildApiRet(0, this.sl);
    }
    getGroupList() {
        return buildApiRet(0, this.gl);
    }

    /**
     * 群员列表使用懒加载，不会在启动时加载所有的群员列表
     * 只会在系统认为需要用到的时候进行加载和更新
     * @param {Number} group_id
     * @returns {Map}
     */
    async getGroupMemberList(group_id) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        if (!this.gml.has(group_id))
            this.gml.set(group_id, this._getGroupMemberList(group_id));
        let mlist = this.gml.get(group_id);
        if (mlist instanceof Promise)
            mlist = await mlist;
        if (mlist)
            return buildApiRet(0, mlist);
        return buildApiRet(102);
    }

    /**
     * 获取陌生人资料
     * @param {Number} user_id 
     * @param {Boolean} no_cache Default: false
     * @returns {JSON} data
     */
    async getStrangerInfo(user_id, no_cache = false) {
        user_id = parseInt(user_id);
        if (!checkUin(user_id))
            return buildApiRet(100);
        let user = this.sl.get(user_id);
        if (no_cache || !user) {
            try {
                user = await this.send(outgoing.buildStrangerInfoRequestPacket(user_id, this));
            } catch (e) {}
        }
        if (user)
            return buildApiRet(0, user);
        return buildApiRet(102);
    }

    /**
     * 群资料会自动和服务器同步，一般来说无需使用no_cache获取
     * @param {Number} group_id
     * @param {Boolean} no_cache Default: false
     * @returns {JSON} data
     */
    async getGroupInfo(group_id, no_cache = false) {
        group_id = parseInt(group_id);
        if (!checkUin(group_id))
            return buildApiRet(100);
        let ginfo = this.gl.get(group_id);
        if (no_cache || !ginfo || timestamp() - ginfo.update_time > 3600) {
            try {
                ginfo = await this.send(outgoing.buildGroupInfoRequestPacket(group_id, this));
            } catch (e) {}
        }
        if (ginfo)
            return buildApiRet(0, ginfo);
        return buildApiRet(102);
    }

    /**
     * 群员资料一般来说也无需使用no_cache获取(性别、年龄等可能更新不及时)
     * @param {Number} group_id
     * @param {Number} user_id
     * @param {Boolean} no_cache Default: false
     * @returns {JSON}
     */
    async getGroupMemberInfo(group_id, user_id, no_cache = false) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        if (!this.gml.has(group_id))
            this.getGroupMemberList(group_id);
        let minfo;
        try {
            minfo = this.gml.get(group_id).get(user_id);
        } catch (e) {}
        if (no_cache || !minfo || timestamp() - minfo.update_time > 3600) {
            try {
                minfo = await this.send(outgoing.buildGroupMemberInfoRequestPacket(group_id, user_id, this));
                if (minfo)
                    this.gml.get(group_id).set(user_id, minfo);
            } catch (e) {}
        }
        if (minfo) 
            return buildApiRet(0, minfo);
        return buildApiRet(102);
    }

    ///////////////////////////////////////////////////

    /**
     * 发送私聊
     * @param {Number} user_id 
     * @param {String|Array} message 
     * @param {Boolean} auto_escape Default: false
     * @returns {JSON}
     *  @field {String} message_id
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
                message_id += resp.sendTime.toString(16);
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
     * 发送群聊，被风控会自动转为长消息发送
     * @param {Number} group_id 
     * @param {String|Array} message 
     * @param {Boolean} auto_escape Default: false
     * @param {Boolean} as_long
     * @returns {JSON}
     *  @field {String} message_id
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
                    }, 500);
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
     * 撤回消息，暂时为立即返回，无法立即知晓是否成功
     * @param {String} message_id hex字符串
     */
    async deleteMsg(message_id) {
        try {
            if (message_id.length < 24)
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
                    const old_role = this.gml.get(group_id).get(user_id).role;
                    const new_role = enable ? "admin" : "member";
                    if (old_role !== new_role && old_role !== "owner") {
                        this.gml.get(group_id).get(user_id).role = new_role;
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

    /**
     * 设置群头衔，最大长度未测试
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {String} special_title 为空收回
     * @param {Number} duration 
     */
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {
        group_id = parseInt(group_id), user_id = parseInt(user_id), duration = parseInt(duration);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildEditSpecialTitleRequestPacket(group_id, user_id, String(special_title), duration?duration:-1, this));
            return buildApiRet(res?0:102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    ///////////////////////////////////////////////////

    /**
     * 设置群名片，超过60字节会被截断
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {String} card 为空还原
     */
    async setGroupCard(group_id, user_id, card = "") {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildEditGroupCardRequestPacket(group_id, user_id, String(card), this));
            return buildApiRet(res?0:102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * 踢人，即使原来就无此人也会返回成功
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
                if (this.gml.has(group_id) && this.gml.get(group_id).delete(user_id)) {
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
     * 禁言，暂时为立即返回，无法立即知晓是否成功
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
     * 退群，即使你本来就不在此群，也会返回成功
     * @param {Number} group_id 
     * @param {Boolean} is_dismiss 不设置is_dismiss只要是群主貌似也可以解散(可能和规模有关?)
     */
    async setGroupLeave(group_id, is_dismiss = false) {
        try {
            group_id = parseInt(group_id);
            if (!checkUin(group_id))
                return buildApiRet(100);
            const res = await this.send(outgoing.buildGroupLeaveRequestPacket(group_id, is_dismiss, this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * 戳一戳，暂时为立即返回，无法立即知晓是否成功
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
     * 处理好友申请
     * @param {String} flag 
     * @param {Boolean} approve 
     * @param {String} remark
     * @param {Boolean} block 是否加入黑名单
     */
    async setFriendAddRequest(flag, approve = true, remark = "", block = false) {
        try {
            const res = await this.send(outgoing.buildNewFriendActionRequestPacket(flag, approve, block, this));
            return buildApiRet(res?0:102);
        } catch (e) {}
        return buildApiRet(103);
    }

    /**
     * 处理群申请和邀请
     * @param {String} flag 
     * @param {Boolean} approve 
     * @param {String} reason 拒绝理由，仅在拒绝他人加群时有效
     * @param {Boolean} block 是否加入黑名单
     */
    async setGroupAddRequest(flag, approve = true, reason = "", block = false) {
        try {
            const res = await this.send(outgoing.buildNewGroupActionRequestPacket(flag, approve, String(reason), block, this));
            return buildApiRet(res?0:102);
        } catch (e) {}
        return buildApiRet(103);
    }

    /**
     * 加群员为好友，暂不支持非群员
     * ※重复添加或者对方设置为拒绝添加会返回失败
     * ※对方设置要正确回答问题，暂时也返回失败
     * @param {Number} group_id 
     * @param {Number} user_id 
     * @param {String} comment 
     */
    async addFriend(group_id, user_id, comment = "") {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const type = await this.send(outgoing.buildAddSettingRequestPacket(user_id, this));
            switch (type) {
                case 0:
                case 1:
                // case 3:
                case 4:
                    var res = await this.send(outgoing.buildAddFriendRequestPacket(type, group_id, user_id, String(comment), this));
                    return buildApiRet(res ? 0 : 102);
                default:
                    return buildApiRet(102);
            }
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * 删除好友，即使对方本来就不是你的好友，也会返回成功
     * @param {Number} user_id 
     * @param {Boolean} block 
     */
    async deleteFriend(user_id, block = true) {
        user_id = parseInt(user_id);
        if (!checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildDelFriendRequestPacket(user_id, block, this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * 邀请好友入群，暂不支持邀请陌生人
     * ※对方必须是BOT的好友，否则返回失败
     * ※如果BOT不是对方的好友(单向)，对方又设置了拒绝陌生人邀请，此时会返回成功但是对方实际收不到邀请
     * @param {Number} group_id 
     * @param {Number} user_id 
     */
    async inviteFriend(group_id, user_id) {
        group_id = parseInt(group_id), user_id = parseInt(user_id);
        if (!checkUin(group_id) || !checkUin(user_id))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildInviteRequestPacket(group_id, user_id, this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * 点赞，请勿频繁调用，否则有冻结风险
     * @param {Number} user_id 
     * @param {Number} times 
     */
    async sendLike(user_id, times = 1) {
        times = parseInt(times), user_id = parseInt(user_id);
        if (!checkUin(user_id) || !(times > 0 && times <= 20))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildSendLikeRequestPacket(user_id, times, this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /////////////////////////////////////////////// 个人设置

    /**
     * @param {String} nickname 昵称最长48字节，允许设为空，别人看到的昵称会变为你的QQ号
     */
    async setNickname(nickname) {
        try {
            const res = await this.send(outgoing.buildSetProfileRequestPacket(0x14E22, String(nickname), this));
            if (res) {
                this.nickname = nickname;
                return buildApiRet(0);
            }
            return buildApiRet(102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {String} description 个人说明
     */
    async setDescription(description = "") {
        try {
            const res = await this.send(outgoing.buildSetProfileRequestPacket(0x14E33, String(description), this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {Number} gender 性别 0未知 1男 2女
     */
    async setGender(gender) {
        gender = parseInt(gender);
        if (![0,1,2].includes(gender))
            return buildApiRet(100);
        try {
            const res = await this.send(outgoing.buildSetProfileRequestPacket(0x14E29, Buffer.from([gender]), this));
            if (res) {
                this.gender = gender;
                return buildApiRet(0);
            }
            return buildApiRet(102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {String} birthday 生日必须是20110202这样的形式
     */
    async setBirthday(birthday) {
        try {
            birthday = String(birthday).replace(/[^\d]/g, "");
            const buf = Buffer.alloc(4);
            buf.writeUInt16BE(parseInt(birthday.substr(0, 4)));
            buf.writeUInt8(parseInt(birthday.substr(4, 2)), 2);
            buf.writeUInt8(parseInt(birthday.substr(6, 2)), 3);
            const res = await this.send(outgoing.buildSetProfileRequestPacket(0x16593, buf, this));
            if (res)
                this.age = new Date().getFullYear() - birthday.substr(0, 4);
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    /**
     * @param {String} signature 个人签名超过254字节会被截断
     */
    async setSignature(signature = "") {
        try {
            const res = await this.send(outgoing.buildSetSignRequestPacket(String(signature), this));
            return buildApiRet(res ? 0 : 102);
        } catch (e) {
            return buildApiRet(103);
        }
    }

    ///////////////////////////////////////////////////

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

    test(a) {
        // this.write(outgoing.(a, this));
    }
}

//----------------------------------------------------------------------------------------------------

const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";
logger.info("OICQ程序启动。当前内核版本：v" + version.version);

const config = {
    web_image_timeout:  0,  //下载网络图片的超时时间
    web_record_timeout: 0,  //下载网络语音的超时时间
    cache_root:         path.join(process.mainModule.path, "data"), //缓存文件夹根目录，需要可写权限
    debug: false,
};

process.OICQ = {
    logger, config
};

function createCacheDir(uin) {
    if (!fs.existsSync(config.cache_root))
        fs.mkdirSync(config.cache_root, {mode: 0o755, recursive: true});
    const img_path = path.join(config.cache_root, "image");
    const ptt_path = path.join(config.cache_root, "record");
    const uin_path = path.join(config.cache_root, uin.toString());
    if (!fs.existsSync(img_path))
        fs.mkdirSync(img_path);
    if (!fs.existsSync(ptt_path))
        fs.mkdirSync(ptt_path);
    if (!fs.existsSync(uin_path))
        fs.mkdirSync(uin_path, {mode: 0o755});
    return uin_path;
}

/**
 * 全局设置
 */
function setGlobalConfig(config = {}) {
    Object.assign(process.OICQ.config, config);
    if (config.debug)
        logger.level = "debug";
}

/**
 * @param {Number} uin 
 * @param {Object} config 
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
