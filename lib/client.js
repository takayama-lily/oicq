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
const BUF0 = Buffer.alloc(0);

class OICQError extends Error {};

const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";

const server_list = [
    {ip:"msfwifi.3g.qq.com",port:8080,ping:null},
    {ip:"42.81.169.46",port:8080,ping:null},
    {ip:"42.81.172.81",port:80,ping:null},
    {ip:"42.81.172.147",port:443,ping:null},
    {ip:"42.81.172.22",port:80,ping:null},
    {ip:"114.221.148.59",port:14000,ping:null},
    {ip:"114.221.144.215",port:80,ping:null},
    {ip:"125.94.60.146",port:80,ping:null}
];

const default_config = {
    ignore_self: true,  //群聊是否过滤自己的发言
    login_type: 2,      //1手机 2平板
    log_level: "info",  //trace,debug,info,warn,error,fatal,off
    enable_db: true,    //启用sqlite数据库，不启用无法撤回和转发消息
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
 * @event online 上线
 * @event offline 下线(被挤、封号等强制下线、没有网络)，并且无法重新连接
 * @event timeout 超时未收到某个响应包
 * @event reboot 断线或心跳失联重启，重连后会触发online事件
 * 
 * @event message
 * @event message.private
 * @event message.private.friend
 * @event message.private.temp
 * @event message.friend
 * @event message.temp
 * @event message.group
 * @event message.discuss @deprecated
 * 
 * @event request
 * @event request.friend
 * @event request.friend.add
 * @event request.friend.recommend
 * @event request.group
 * @event request.group.add
 * @event request.group.invite
 * 
 * @event notice.friend
 * @event notice.friend.increase
 * @event notice.friend.decrease
 * @event notice.friend.recall
 * @event notice.group
 * @event notice.group.upload
 * @event notice.group.admin
 * @event notice.group.transfer
 * @event notice.group.recall
 * @event notice.group.ban
 * @event notice.group.config
 * @event notice.group.card
 * @event notice.group.increase
 * @event notice.group.decrease
 * 
 * @event login.notice.captcha
 * @event login.notice.device
 * @event login.error.slider
 * @event login.error.other
 * @event login.error.unknown
 */
class AndroidClient extends Client {
    reconn_flag = true;
    reconn_time = 0;
    timeout = 3000; //回包等待超时
    status = Client.OFFLINE;
    logger = null;

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

        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        this.sub_appid = config.login_type === 1 ? 537062845 : 537062409;
        this.ignore_self = config.ignore_self;

        const filepath = path.join(config.device_filepath, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device_info = device(filepath);

        this.on("error", (err)=>{
            this.logger.error(err.message);
            switch (err.code) {
                case "ENOTFOUND":
                case "EHOSTUNREACH":
                case "ECONNREFUSED":
                    this.reconn_flag = false;
                    this.logger.error("网络不通畅。");
                    break;
            }
        });
        this.on("close", ()=>{
            this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.status = Client.OFFLINE;
            this.stopHeartbeat();
            if (this.reconn_time > 5) {
                this.reconn_flag = false;
                this.logger.error("多次重连失败，请检查网络。");
                this.emit("offline");
            }
            if (this.reconn_flag) {
                ++this.reconn_time;
                this.emit("reboot");
                this._connect(async()=>{
                    try {
                        //这里应该需要解析response
                        await this.send(outgoing.buildClientRegisterPacket(this));
                        this.status = Client.ONLINE;
                        this.emit("online");
                    } catch (e) {
                        this.login();
                    }
                });
            }
        });

        // 在这里拆分包
        this.on("readable", ()=>{
            while (this.readableLength >= 4) {
                let len_buf = this.read(4);
                let len = len_buf.readInt32BE();
                if (this.readableLength >= len - 4) {
                    const incoming_packet = this.read(len - 4);
                    // console.log(incoming_packet);
                    this.emit("_packet", incoming_packet);
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        })
        this.on("_packet", (packet)=>{
            var res;
            try {
                res = imcoming(packet, this);
            } catch (e) {
                this.logger.trace(e);
                return;
            }
            if (this.handlers[res.seq_id]) {
                clearTimeout(this.handlers[res.seq_id].t);
                this.handlers[res.seq_id].cb(res);
                delete this.handlers[res.seq_id];
            }
        });

        this.on("_login", async()=>{
            this.logger.info(`Welcome, ${this.nickname} ! 正在初始化..`);
            this.startHeartbeat();
            this.write(outgoing.buildClientRegisterRequestPacket(this));
            await Promise.all([
                this.getFriendList(false), this.getGroupList(false)
            ]);
            // this.logger.trace(this.friend_list);
            // this.logger.trace(this.group_list);
            const gid_list = Object.keys(this.group_list);
            this.logger.info(`加载了${Object.keys(this.friend_list).length}个好友，${gid_list.length}个群，正在加载群员列表...`);
            const await_list = [];
            for (let v of gid_list) {
                await_list.push(this.getGroupMemberList(v, false))
            }
            await Promise.all(await_list);
            // this.logger.trace(this.group_member_list)
            // await this.send(outgoing.buildStartGetMessageRequestPacket(this));
            this.status = Client.ONLINE;
            this.logger.info(`初始化完毕，开始处理信息。`);
            this.emit("online");
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
            this.reconn_time = 0;
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
                    if (res.retcode) {
                        reject(res);
                        const code = res.error.code.split(".");
                        if (["notice", "warn", "error"].includes(code[1])) {
                            this.emit(res.error.code, res);
                            this.emit(code.slice(0,2).join("."), res);
                        }
                    } else
                        resolve(res);
                };
                this.handlers[seq_id].t = setTimeout(()=>{
                    delete this.handlers[seq_id];
                    reject({
                        retcode: 1,
                        error: {
                            code: exception.codes.RESPONSE_TIMEOUT,
                            message: timeout + "ms"
                        }
                    });
                }, timeout);
            });
        });
    }

    async _doLogin(packet) {
        try {
            await this.send(packet);
            this.emit("_login");
        } catch (e) {
            if (e.error.code === exception.codes.LOGIN_IMAGE_CAPTCHA) {
                this.captcha_sign = e.error.sign;
            } else if (e.error.code === exception.codes.LOGIN_DEVICE_LOCK) {
                const packet = outgoing.buildDeviceLoginRequestPacket(e.error.message, this);
                this.logger.info("login...");
                this._doLogin(packet);
            } else if (e.error.code === exception.codes.LOGIN_VERIFY_URL) {
                // do nothing
            } else {
                this.terminate();
            }
        }
    }

    startHeartbeat() {
        this.heartbeat = setInterval(async()=>{
            try {
                await this.send(outgoing.buildHeartbeatRequestPacket(this));
            } catch (e) {
                //心跳未返回
            }
        }, 30000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat);
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
            this.device_info = device(path.join(config.device_filepath, `device-${this.uin}.json`));
        }
        this._connect(()=>{
            this._doLogin(outgoing.buildPasswordLoginRequestPacket(this));
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
            throw new OICQError("Illegal argument type.")
        }
        const packet = outgoing.buildCaptchaLoginRequestPacket(
            Buffer.byteLength(captcha) === 4 ? captcha : "abcd", this.captcha_sign, this
        );
        this._doLogin(packet);
    }

    /**
     * 主动关闭后好像无法再次登陆?，需要重新创建实例
     * 还需要研究
     */
    terminate() {
        if (this.status === Client.OFFLINE)
            return;
        this.reconn_flag = false;
        this.destroy();
    }

    isOnline() {
        return this.status === Client.ONLINE;
    }

    async getFriendList(cache = true) {
        if (!cache) {
            try {
                let start = 0;
                while (1) {
                    const resp = await this.send(outgoing.buildFriendListRequestPacket(start, 150, this));
                    this.friend_list = {
                        ...this.friend_list,
                        ...resp.data
                    };
                    start += 150;
                    if (Object.keys(resp.data).length < 150)
                        break;
                }
            } catch (e) {
                this.logger.warn("timeout: getFriendList");
            }
        }
        return this.friend_list;
    }
    async getGroupList(cache = true) {
        if (!cache) {
            try {
                const resp = await this.send(outgoing.buildGroupListRequestPacket(this));
                this.group_list = resp.data;
            } catch (e) {
                this.logger.warn("timeout: getGroupList");
            }
        }
        return this.group_list;
    }
    async getGroupMemberList(group_id, cache = true) {
        if (!cache || !this.group_member_list[group_id]) {
            try {
                let next = 0;
                while (1) {
                    const resp = await this.send(outgoing.buildGroupMemberListRequestPacket(
                        parseInt(group_id), this.group_list[group_id].group_code, next, this
                    ));
                    next = resp.next;
                    delete resp.next;
                    if (!Object.keys(resp.data).length || this.group_list[group_id]) {
                        delete this.group_list[group_id];
                        delete this.group_member_list[group_id];
                        break;
                    } else {
                        if (!this.group_member_list[group_id])
                            this.group_member_list[group_id] = {}
                        this.group_member_list[group_id] = {
                            ...this.group_member_list[group_id],
                            ...resp.data
                        };
                    }
                    if (!next)
                        break;
                }
            } catch (e) {
                this.logger.warn("timeout: getGroupMemberList");
            }
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
    logger.info("Testing servers...");
    const tests = [];
    for (let v of server_list) {
        v.ping = null;
        tests.push(ping.promise.probe(v.ip, {extra: ['-n', '4']}).then((p)=>{
            delete p.output;
            server_list.find((o)=>v.ip===o.ip).ping = p;
            server_list.sort((a, b)=>{
                if (!b.ping) return -1;
                if (!a.ping) return 1;
                if (!b.ping.alive) return -1;
                if (parseFloat(b.ping.packetLoss) > parseFloat(a.ping.packetLoss)) return -1;
                if (parseFloat(a.ping.packetLoss) > parseFloat(b.ping.packetLoss)) return 1;
                if (b.ping.time > a.ping.time) return -1;
                return 0;
            })
        }));
    }
    await Promise.all(tests);
    logger.info("Servers tested. The best server is " + server_list[0].ip);
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
