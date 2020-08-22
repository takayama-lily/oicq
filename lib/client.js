"use strict";
const net = require("net");
const fs = require("fs");
const path = require("path");
const ping = require("ping");
const log4js = require("log4js");
const device = require("./device");
const exception = require("./exception");
const common = require("./packet/common");
const outgoing = require("./packet/outgoing");
const imcoming = require("./packet/incoming");
const event = require("./event");
const BUF0 = Buffer.alloc(0);

class OICQError extends Error {};

// const logger = log4js.getLogger("[SYSTEM]");
// logger.level = "info";

const server_list = [
    {ip:"msfwifi.3g.qq.com",port:8080,ping:null},
    // {ip:"42.81.169.46",port:8080,ping:null},
    // {ip:"42.81.172.81",port:80,ping:null},
    // {ip:"42.81.172.147",port:443,ping:null},
    // {ip:"42.81.172.22",port:80,ping:null},
    // {ip:"114.221.148.59",port:14000,ping:null},
    // {ip:"114.221.144.215",port:80,ping:null},
    // {ip:"125.94.60.146",port:80,ping:null}
];

//默认设置
const default_config = {
    ignore_self: true,      //群聊是否过滤自己的发言
    login_type: 2,          //1手机 2平板
    log_level: "info",      //trace,debug,info,warn,error,fatal,off
    enable_db: true,        //启用sqlite数据库
    kickoff_reconn: false,  //被挤下线是否在3秒后反挤对方
    db_filepath: path.join(process.mainModule.path, "data"),        //db文件保存路径，默认为main目录下data文件夹
    device_filepath: path.join(process.mainModule.path, "data"),    //设备文件保存路径，默认为main目录下data文件夹
};

/**
 * @link https://nodejs.org/dist/latest/docs/api/net.html#net_class_net_socket
 */
class Client extends net.Socket {
    static OFFLINE = Symbol("OFFLINE");
    static INIT = Symbol("INIT");
    static ONLINE = Symbol("ONLINE");
}

/**
 * @全部事件 事件为冒泡传递，例如request.group.add事件，若未监听会沿着request.group传递到request
 * 
 * 聊天应用事件
 * @event message 消息类
 *  @event message.private
 *      @event message.private.friend
 *      @event message.private.group
 *      @event message.private.other
 *  @event message.group
 *      @event message.group.normal
 *      @event message.group.anonymous
 *      @event message.group.notice
 * @event request 请求类
 *  @event request.friend
 *      @event request.friend.add
 *  @event request.group
 *      @event request.group.add
 *      @event request.group.invite
 * @event notice 通知类(命名需要重新规划)
 *  @event notice.friend
 *      @event notice.friend.increase
 *      @event notice.friend.decrease
 *      @event notice.friend.recall
 *  @event notice.group
 *      @event notice.group.upload
 *      @event notice.group.admin
 *      @event notice.group.transfer
 *      @event notice.group.recall
 *      @event notice.group.ban
 *      @event notice.group.config
 *      @event notice.group.card
 *      @event notice.group.increase
 *      @event notice.group.decrease
 * 
 * 系统事件
 * @event system
 *  @event system.login
 *      @event system.login.captcha 验证码需要处理 {image}
 *      @event system.login.device 设备锁需要处理(暂不支持区分真假设备锁) {url}
 *      @event system.login.error 登陆失败 {message}
 *  @event system.online 上线(可以开始处理消息)
 *  @event system.offline 下线(无法再次连接)
 *      @event system.offline.network 拔线
 *      @event system.offline.frozen 账号冻结
 *      @event system.offline.kickoff 被挤下线
 *      @event system.offline.unknown 未知领域
 *  @event system.reconn 断线重连，重连后会触发online事件(online之前无法处理消息)
 * 
 * 内部事件(不应该在外部监听)
 * @event internal
 *  @event internal.login login成功
 *  @event internal.kickoff 被强制下线
 * 
 * 网络层事件(请勿随意监听，否则可能导致系统运行不正常)
 * @event pause,readable,finish,pipe,unpipe
 * @event close,connect,data,drain,end,error,lookup,ready,timeout
 */
class AndroidClient extends Client {
    reconn_flag = true;
    timeout = 3000; //回包等待超时
    logger;
    config;
    status = Client.OFFLINE;
    kickoff_reconn = false;
    last_online_time = 0;
    last_offline_time = 0;

    uin = 0;
    password_md5;
    // appid = 16;
    sub_appid;
    ignore_self = true;

    nickname = "";
    age = 0;
    gender = 0;
    friend_list = {}; //虽然是map，但习惯叫list了
    group_list = {};
    group_member_list = {};

    heartbeat = null;
    seq_id = 0;
    req_id = 0;
    handlers = {};

    session_id = Buffer.from([0x02, 0xB0, 0x5B, 0x8B]);
    random_key = common.md5(common.rand().toString());
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

    syncCookie;
    pubAccountCookie;
    msgCtrlBuf;

    /**
     * @constructor
     * @param {Number} uin
     * @param {Object} config 
     */
    constructor(uin, config = {}) {
        super();
        this.uin = uin;

        config = {
            ...default_config,
            ...config
        };
        this.config = config;

        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        this.sub_appid = config.login_type === 2 ? 537062845 : 537062409;
        this.ignore_self = config.ignore_self;
        this.kickoff_reconn = config.kickoff_reconn;

        const filepath = path.join(config.device_filepath, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device_info = device(filepath);

        this.on("error", (err)=>{
            this.logger.error(err.message);
        });
        this.on("close", ()=>{
            this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.stopHeartbeat();
            if (this.status === Client.OFFLINE) {
                return event.emit(this, "system.offline.network");
            }
            this.status = Client.OFFLINE;
            if (this.reconn_flag) {
                this._connect(this.changeOnlineStatus.bind(this));
                event.emit(this, "system.reconn");
            }
        });

        // 在这里拆分包
        this.on("readable", ()=>{
            while (this.readableLength >= 4) {
                let len_buf = this.read(4);
                let len = len_buf.readInt32BE();
                if (this.readableLength >= len - 4) {
                    const packet = this.read(len - 4);
                    // console.log(incoming_packet);
                    try {
                        imcoming(packet, this);
                    } catch (e) {
                        this.logger.trace(e);
                    }
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        })

        this.on("internal.login", async()=>{
            this.logger.info(`Welcome, ${this.nickname} !`);
            await this.changeOnlineStatus();
            await Promise.all([
                this.getFriendList(false), this.getGroupList(false)
            ]);
            const group_keys = Object.keys(this.group_list);
            this.logger.info(`加载了${Object.keys(this.friend_list).length}个好友，${group_keys.length}个群。`);
            for (let v of group_keys) {
                this.getGroupMemberList(v, false);
            }
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
            this.reconn_flag = true;
            this.resume();
            callback();
        });
    }

    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1;
        return this.seq_id;
    }
    nextReq() {
        ++this.req_id;
        if (this.req_id > 0x7fffffff)
            this.req_id = 1;
        return this.req_id;
    }

    /**
     * @async reject if retcode=1
     * @param {Buffer} packet
     * @param {Number} timeout ms
     * @returns {OICQResponse}
     */
    async send(packet, timeout = this.timeout) {
        const seq_id = this.seq_id;
        return new Promise((resolve, reject)=>{
            this.write(packet, ()=>{
                this.handlers[seq_id] = {};
                this.handlers[seq_id].cb = (res)=>{
                    if (res.retcode)
                        reject(res);
                    else
                        resolve(res);
                };
                this.handlers[seq_id].t = setTimeout(()=>{
                    delete this.handlers[seq_id];
                    reject({
                        retcode: 1,
                        error: "timeout"
                    });
                }, timeout);
            });
        });
    }

    startHeartbeat() {
        if (this.heartbeat)
            return;
        this.heartbeat = setInterval(async()=>{
            try {
                await this.send(outgoing.buildHeartbeatRequestPacket(this));
            } catch (e) {
                //心跳未返回 todo
            }
        }, 30000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
    }

    // 以下是public方法 ----------------------------------------------------------------------------------------------------

    /**
     * 密码登陆
     * @param {Buffer|String} password_md5 这里不传递明文密码
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
            this.device_info = device(path.join(this.config.device_filepath, `device-${this.uin}.json`));
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
     * 使用此函数关闭连接，不要使用end和destroy
     * 重要：客户端在任何情况下都不会主动关闭连接！
     */
    terminate() {
        if (this.status === Client.OFFLINE)
            return;
        this.reconn_flag = false;
        this.end();
    }

    isOnline() {
        return this.status === Client.ONLINE;
    }

    async changeOnlineStatus(status = 11) {
        try {
            this.startHeartbeat();
            await this.send(outgoing.buildClientRegisterRequestPacket(this));
            if (!this.listenerCount("internal.kickoff")) {
                this.once("internal.kickoff", (data)=>{
                    this.status = Client.INIT;
                    this.logger.warn(data.info);
                    var sub_type;
                    if (data.info.includes("另一")) {
                        if (this.kickoff_reconn) {
                            this.logger.info("3秒后重新连接..");
                            setTimeout(this.login.bind(this), 3000);
                        }
                        sub_type = "kickoff";
                    } else if (data.info.includes("冻结")) {
                        sub_type = "frozen";
                    } else {
                        sub_type = "unknown";
                    }
                    event.emit(this, "system.offline."+sub_type);
                })
            }
            if (!this.isOnline()) {
                this.status = Client.ONLINE;
                event.emit(this, "system.online");
            }
        } catch (e) {
            //todo
        }
    }

    async getFriendList(cache = true) {
        if (!cache) {
            try {
                let start = 0;
                while (1) {
                    const resp = await this.send(outgoing.buildFriendListRequestPacket(start, 150, this));
                    Object.assign(this.friend_list, resp.data);
                    start += 150;
                    if (Object.keys(resp.data).length < 150)
                        break;
                }
            } catch (e) {}
        }
        return this.friend_list;
    }
    async getGroupList(cache = true) {
        if (!cache) {
            try {
                const resp = await this.send(outgoing.buildGroupListRequestPacket(this));
                this.group_list = resp.data;
            } catch (e) {}
        }
        return this.group_list;
    }
    async getGroupMemberList(group_id, cache = true) {
        if (!cache || !this.group_member_list[group_id]) {
            try {
                let next = 0;
                while (1) {
                    const resp = await this.send(outgoing.buildGroupMemberListRequestPacket(
                        this.group_list[group_id].uin, parseInt(group_id), next, this
                    ));
                    next = resp.next;
                    delete resp.next;
                    if (!Object.keys(resp.data).length || !this.group_list[group_id]) {
                        delete this.group_list[group_id];
                        delete this.group_member_list[group_id];
                        break;
                    } else {
                        if (!this.group_member_list[group_id])
                            this.group_member_list[group_id] = {}
                        Object.assign(this.group_member_list[group_id], resp.data);
                    }
                    if (!next)
                        break;
                }
            } catch (e) {}
        }
        return this.group_member_list[group_id];
    }

    // todo
    async sendPrivateMsg(user_id) {}
    async sendGroupMsg(group_id, message) {}
    async deleteMsg(message_id) {}
    async setGroupCard(group_id, user_id, card = "") {}
    async setGroupKick(group_id, user_id, reject_add_request = false) {}
    async setGroupBan(group_id, user_id, duration = 600) {}
    async setGroupAnonymousBan(group_id, anonymous_flag,  duration = 600) {}
    async setGroupWholeBan(group_id, enable = true) {}
    async setGroupAnonymous(group_id, enable = true) {}
    async setGroupName(group_id, group_name) {}
    async setGroupAdmin(group_id, user_id, enable = true) {}
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {}
    async setGroupLeave(group_id, is_dismiss = false) {}
    async setFriendAddRequest(flag, approve = true, remark = undefined) {}
    async setGroupAddRequest(flag, approve = true, reason = undefined) {}
    async setGroupInviteRequest(flag, approve = true, reason = undefined) {}
    async getStrangerInfo(user_id) {}
    async getGroupInfo(group_id, cache = true) {}
    async getGroupMemberInfo(group_id, user_id, cache = true) {}
}

//----------------------------------------------------------------------------------------------------

/**
 * 测定所有服务器的ping 按优劣排序
 * 连接时会自动选择第一个(最优的)
 * @async
 */
async function testServers() {
    // logger.info("Testing servers...");
    // const tests = [];
    // for (let v of server_list) {
    //     v.ping = null;
    //     tests.push(ping.promise.probe(v.ip, {extra: ['-n', '4']}).then((p)=>{
    //         delete p.output;
    //         server_list.find((o)=>v.ip===o.ip).ping = p;
    //         server_list.sort((a, b)=>{
    //             if (!b.ping) return -1;
    //             if (!a.ping) return 1;
    //             if (!b.ping.alive) return -1;
    //             if (parseFloat(b.ping.packetLoss) > parseFloat(a.ping.packetLoss)) return -1;
    //             if (parseFloat(a.ping.packetLoss) > parseFloat(b.ping.packetLoss)) return 1;
    //             if (b.ping.time > a.ping.time) return -1;
    //             return 0;
    //         })
    //     }));
    // }
    // await Promise.all(tests);
    // logger.info("Servers tested. The best server is " + server_list[0].ip);
}

/**
 * @param {Number} uin 
 * @param {Object} config 
 * @returns {AndroidClient}
 */
function createClient(uin, config = {}) {
    uin = parseInt(uin);
    if (uin <= 10000 || uin >= 4000000000 || isNaN(uin))
        throw new OICQError("Argument uin is not an OICQ account.");
    if (typeof config !== "object" || config === null)
        throw new OICQError("Argument config is illegal.");
    return new AndroidClient(uin, config);
}

module.exports = {
    createClient, testServers
};
