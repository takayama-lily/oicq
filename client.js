"use strict";
const version = require("./package.json");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const log4js = require("log4js");
const device = require("./device");
const {checkUin, emit, TimeoutError} = require("./lib/common");
const core = require("./lib/core");
const wt = require("./lib/wtlogin/wt");
const chat = require("./lib/message/chat");
const troop = require("./lib/troop");
const BUF0 = Buffer.alloc(0);

const server_list = [
    {ip:"msfwifi.3g.qq.com",port:8080,ping:null},
];

function buildApiRet(retcode, data = null, error = null) {
    data = data ? data : null;
    error = error ? error : null;
    const status = retcode ? (retcode===1?"async":"failed") : "ok";
    return {
        retcode, data, status, error
    };
}

class Client extends net.Socket {
    static OFFLINE = Symbol("OFFLINE");
    static INIT = Symbol("INIT");
    static ONLINE = Symbol("ONLINE");
}
class AndroidClient extends Client {
    reconn_flag = true;
    logger;
    config;
    status = Client.OFFLINE;
    kickoff_reconn = false;
    ignore_self = true;

    // default phone
    apkid = "com.tencent.mobileqq";
    apkver = "8.4.1.2703";
    apkname = "A8.4.1.2703aac4";
    apksign = Buffer.from([166, 183, 69, 191, 36, 162, 194, 119, 82, 119, 22, 246, 243, 110, 182, 141]);
    buildtime = 1591690260;
    appid = 16;
    sub_appid = 537064989;
    bitmap = 184024956;
    sigmap = 34869472;
    sdkver = "6.0.0.2428";
    ksid;
    device;
    
    uin = 0;
    password_md5;
    nickname = "";
    age = 0;
    sex = 0;
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
    captcha_sign;
    t104;

    sig = {
        tgt: BUF0,
        tgt_key: BUF0,
        st_key: BUF0,
        st_web_sig: BUF0,
        s_key: BUF0,
        d2: BUF0,
        d2key: BUF0,
        sig_key: BUF0,
        ticket_key: BUF0,
        device_token: BUF0,
    };

    sync_finished = false;
    sync_cookie;
    const1 = crypto.randomBytes(4).readUInt32BE();
    const2 = crypto.randomBytes(4).readUInt32BE();

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
        this.ignore_self = config.ignore_self;
        this.kickoff_reconn = config.kickoff;

        if (config.platform == 3)
            this.sub_appid = 537061176;
        else if  (config.platform == 2) {
            this.sub_appid = 537065549;
            this.apkid = "com.tencent.minihd.qq";
            this.apkver = "5.8.9.3460";
            this.apkname = "A5.8.9.3460";
            this.apksign = Buffer.from([170, 57, 120, 244, 31, 217, 111, 249, 145, 74, 102, 158, 24, 100, 116, 199]);
            this.buildtime = 1595836208;
            this.bitmap = 150470524;
            this.sigmap = 1970400;
        }

        const filepath = path.join(this.dir, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device = device(filepath);
        this.ksid = Buffer.from(`|${this.device.imei}|` + this.apkname);

        this.on("error", (err)=>{
            this.logger.error(err.message);
        });
        this.on("close", (e_flag)=>{
            if (this.remoteAddress)
                this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.stopHeartbeat();
            if (this.status === Client.OFFLINE) {
                this.logger.error("网络不通畅。");
                return emit(this, "system.offline.network");
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
                    try {
                        core.parseIncomingPacket.call(this, packet);
                    } catch (e) {
                        this.logger.debug(e.stack);
                        this.emit("internal.exception", e);
                    }
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        })

        this.on("internal.login", async()=>{
            this.once("internal.change-server", ()=>{
                // todo
            });
            this.logger.info(`Welcome, ${this.nickname} ! 开始初始化资源...`);
            this.sync_cookie = null;
            this.sync_finished = false;
            await this.register();
            if (!this.isOnline())
                return;
            const initFL = async()=>{
                let start = 0;
                while (1) {
                    const total = await core.initFL.call(this, start);
                    start += 150;
                    if (start > total) break;
                }
            }
            await Promise.all([
                initFL(),
                core.initGL.call(this)
            ]);
            this.logger.info(`加载了${this.fl.size}个好友，${this.gl.size}个群。`);
            await core.getMsg.call(this);
            this.sync_finished = true;
            this.logger.info("初始化完毕，开始处理消息。")
            emit(this, "system.online");
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
                    reject(new TimeoutError());
                    emit(this, "internal.timeout", {seq_id});
                }, timeout);
                this.handlers.set(seq_id, (data)=>{
                    clearTimeout(id);
                    this.handlers.delete(seq_id);
                    resolve(data);
                });
            });
        });
    }
    writeUNI(cmd, body, ext) {
        this.write(wt.buildUNIPacket.apply(this, arguments));
    }
    async sendUNI(cmd, body, ext) {
        return await this.send(wt.buildUNIPacket.apply(this, arguments));
    }

    /**
     * @private
     */
    startHeartbeat() {
        if (this.heartbeat)
            return;
        this.heartbeat = setInterval(async()=>{
            if (Date.now() - this.send_timestamp > 300000)
                core.getMsg.call(this);
            try {
                await wt.heartbeat.call(this);
            } catch (e) {
                this.logger.warn("Heartbeat timeout!");
                if (Date.now() - this.recv_timestamp > 10000)
                    this.destroy();
            }
        }, 30000);
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
            emit(this, "system.offline.unknown");
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
                emit(this, "system.offline." + sub_type);
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
                var {map, next} = await core.getGML.call(this, group_id, next);
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

    /**
     * @param {Function} fn 
     * @param {Array} params 
     */
    async callApi(fn, params) {
        if (!this.isOnline() || !this.sync_finished)
            return buildApiRet(104);
        try {
            const rsp = await fn.apply(this, params);
            if (!rsp)
                return buildApiRet(1);
            if (rsp.result > 0)
                return buildApiRet(102, null, {code: rsp.result});
            else
                return buildApiRet(0, rsp.data);
        } catch (e) {
            if (e instanceof TimeoutError)
                return buildApiRet(103, null, {code: -1, message: "packet timeout"});
            return buildApiRet(100, null, {code: -1, message: e.message});
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

    /**
     * 验证码登陆
     * @param {String} captcha 
     */
    captchaLogin(captcha) {
        if (this.isOnline())
            return;
        if (!this.captcha_sign)
            throw new Error("Illegal call.");
        wt.captchaLogin.call(this, captcha);
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
        return await this.callApi(troop.setStatus, arguments);
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
     * @returns {JSON} data
     */
    async getStrangerInfo(user_id, no_cache = false) {
        return await this.callApi(core.getSI, arguments);
    }

    /**
     * 群资料会自动和服务器同步，一般来说无需使用no_cache获取
     * @returns {JSON} data
     */
    async getGroupInfo(group_id, no_cache = false) {
        return await this.callApi(core.getGI, arguments);
    }

    /**
     * 群员资料一般来说也无需使用no_cache获取(性别、年龄等可能更新不及时)
     * @returns {JSON}
     */
    async getGroupMemberInfo(group_id, user_id, no_cache = false) {
        return await this.callApi(core.getGMI, arguments);
    }

    ///////////////////////////////////////////////////

    /**
     * 发送私聊
     * 发送群聊，被风控会自动转为长消息发送
     * 发送讨论组
     * @param {String|Array} message 数组或字符串格式的消息
     * @param {Boolean} auto_escape 是否不解析CQ码
     * @returns {JSON}
     *  @field {String} message_id
     */
    async sendPrivateMsg(user_id, message = "", auto_escape = false) {
        return await this.callApi(chat.sendMsg, [user_id, message, auto_escape, 0]);
    }
    async sendGroupMsg(group_id, message = "", auto_escape = false) {
        return await this.callApi(chat.sendMsg, [group_id, message, auto_escape, 1]);
    }
    async sendDiscussMsg(discuss_id, message = "", auto_escape = false) {
        return await this.callApi(chat.sendMsg, [discuss_id, message, auto_escape, 2]);
    }

    /**
     * 撤回消息，暂时为立即返回，无法立即知晓是否成功
     * @param {String} message_id
     */
    async deleteMsg(message_id) {
        return await this.callApi(chat.recallMsg, arguments);
    }

    ///////////////////////////////////////////////////

    //todo
    // async setGroupAnonymous(group_id, enable = true) {}
    // async setGroupAnonymousBan(group_id, anonymous_flag,  duration = 600) {}
    // async setGroupWholeBan(group_id, enable = true) {}
    async setGroupName(group_id, group_name) {
        return await this.setGroupSetting(group_id, "ingGroupName", Buffer.from(String(group_name)));
    }
    async sendGroupNotice(group_id, content) {
        return await this.setGroupSetting(group_id, "ingGroupMemo", Buffer.from(String(content)));
    }
    async setGroupSetting(group_id, k, v) {
        return await this.callApi(troop.setGroup, arguments);
    }
    async setGroupAdmin(group_id, user_id, enable = true) {
        return await this.callApi(troop.setAdmin, arguments);
    }

    /**
     * 设置群头衔，最大长度未测试
     * @param {String} special_title 为空收回
     * @param {Number} duration -1代表无限期
     */
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {
        return await this.callApi(troop.setTitle, arguments);
    }

    ///////////////////////////////////////////////////

    /**
     * 设置群名片，超过60字节会被截断
     * @param {String} card 为空还原
     */
    async setGroupCard(group_id, user_id, card = "") {
        return await this.callApi(troop.setCard, arguments);
    }

    /**
     * 踢人，即使原来就无此人也会返回成功
     * @param {Boolean} reject_add_request 是否屏蔽
     */
    async setGroupKick(group_id, user_id, reject_add_request = false) {
        return await this.callApi(troop.kickMember, arguments);
    }

    /**
     * 禁言，暂时为立即返回，无法立即知晓是否成功 
     * @param {Number} duration 秒数
     */
    async setGroupBan(group_id, user_id, duration = 1800) {
        return await this.callApi(troop.banMember, arguments);
    }

    /**
     * 退群，即使你本来就不在此群，也会返回成功
     * @param {Boolean} is_dismiss 不设置is_dismiss只要是群主貌似也可以解散(可能和规模有关?)
     */
    async setGroupLeave(group_id, is_dismiss = false) {
        return await this.callApi(troop.leaveGroup, arguments);
    }

    /**
     * 群戳一戳，暂时为立即返回，无法立即知晓是否成功
     */
    async sendGroupPoke(group_id, user_id) {
        return await this.callApi(troop.pokeMember, arguments);
    }

    ///////////////////////////////////////////////////

    /**
     * 处理好友申请
     * @param {String} flag 从事件中得到
     * @param {Boolean} approve 
     * @param {String} remark 暂未实现remark
     * @param {Boolean} block 是否屏蔽
     */
    async setFriendAddRequest(flag, approve = true, remark = "", block = false) {
        return await this.callApi(troop.friendAction, arguments);
    }

    /**
     * 处理群申请和邀请
     * @param {String} flag 从事件中得到
     * @param {Boolean} approve 
     * @param {String} reason 拒绝理由，仅在拒绝他人加群时有效
     * @param {Boolean} block 是否屏蔽
     */
    async setGroupAddRequest(flag, approve = true, reason = "", block = false) {
        return await this.callApi(troop.groupAction, arguments);
    }

    /**
     * 发送加群申请，即使你已经在群里，也会返回成功
     * ※设置为要正确回答问题的群，暂时回返回失败
     * ※风险接口，每日加群超过一定数量账号必被风控(甚至ip)
     * @param {String} comment 该参数仅占位，暂未实现
     */
    async addGroup(group_id, comment = "") {
        return await this.callApi(troop.addGroup, arguments);
    }

    /**
     * 加群员为好友，暂不支持非群员(群号可以传0，但是必须有共同群，否则对方无法收到请求)
     * ※对方设置要正确回答问题的时候，暂时会返回失败
     * ※风险接口，每日加好友超过一定数量账号必被风控(甚至ip)
     * @param {String} comment 附加信息
     */
    async addFriend(group_id, user_id, comment = "") {
        return await this.callApi(troop.addFriend, arguments);
    }

    /**
     * 删除好友，即使对方本来就不是你的好友，也会返回成功
     * @param {Boolean} block 是否屏蔽
     */
    async deleteFriend(user_id, block = true) {
        return await this.callApi(troop.delFriend, arguments);
    }

    /**
     * 邀请好友入群，暂不支持邀请陌生人
     * ※对方必须是BOT的好友，否则返回失败
     * ※如果BOT不是对方的好友(单向)，对方又设置了拒绝陌生人邀请，此时会返回成功但是对方实际收不到邀请
     */
    async inviteFriend(group_id, user_id) {
        return await this.callApi(troop.inviteFriend, arguments);
    }

    /**
     * 点赞，请勿频繁调用，否则有冻结风险
     */
    async sendLike(user_id, times = 1) {
        return await this.callApi(troop.sendLike, arguments);
    }

    /////////////////////////////////////////////// 个人设置

    /**
     * @param {String} nickname 昵称最长48字节，允许设为空，别人看到的昵称会变为你的QQ号
     */
    async setNickname(nickname) {
        return await this.callApi(troop.setProfile, [0x14E22, String(nickname)]);
    }

    /**
     * @param {String} description 设置个人说明
     */
    async setDescription(description = "") {
        return await this.callApi(troop.setProfile, [0x14E33, String(description)]);
    }

    /**
     * @param {Number} gender 性别 0未知 1男 2女
     */
    async setGender(gender) {
        gender = parseInt(gender);
        if (![0,1,2].includes(gender))
            return buildApiRet(100);
        return await this.callApi(troop.setProfile, [0x14E29, Buffer.from([gender])]);
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
            return await this.callApi(troop.setProfile, [0x16593, buf]);
        } catch (e) {
            return buildApiRet(100);
        }
    }

    /**
     * @param {String} signature 个人签名超过254字节会被截断
     */
    async setSignature(signature = "") {
        return await this.callApi(troop.setSign, arguments);
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
            age: this.age, sex: this.sex
        })
    }
}

//----------------------------------------------------------------------------------------------------

const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";
logger.info("OICQ程序启动。当前内核版本：v" + version.version);

const config = {
    web_image_timeout: 0,
    web_record_timeout: 0,
    cache_root: path.join(process.mainModule.path, "data"),
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
 * @param {JSON} config 
 */
function setGlobalConfig(config = {}) {
    Object.assign(process.OICQ.config, config);
    if (config.debug)
        logger.level = "debug";
}

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
