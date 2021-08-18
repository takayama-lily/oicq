/**
 * 扩展Client类
 */
"use strict";

const { randomBytes } = require("crypto");
const { Client } = require("./client");
const tea = require("./algo/tea");
const pb = require("./algo/pb");
const { timestamp, uin2code, BUF16, log } = require("./common");
const { TimeoutError } = require("./exception");
const { parseC2CMsg } = require("./message/parser");

/**
 * seqid递增并返回
 */
Client.prototype.nextSeq = function() {
    if (++this.seq_id >= 0x8000)
        this.seq_id = 1;
    return this.seq_id;
};

const ERROR_TIMEOUT = new TimeoutError("package timeout");

/**
 * 发送一个包并返回响应包
 */
Client.prototype.send = function (packet, timeout = 5) {
    ++this.stat.sent_pkt_cnt;
    const seq_id = this.seq_id;
    return new Promise((resolve, reject) => {
        this._socket.write(packet, () => {
            const id = setTimeout(() => {
                this.handlers.delete(seq_id);
                ++this.stat.lost_pkt_cnt;
                reject(ERROR_TIMEOUT);
            }, timeout * 1000);
            this.handlers.set(seq_id, (data) => {
                clearTimeout(id);
                this.handlers.delete(seq_id);
                resolve(data);
            });
        });
    });
};

/**
 * 发送一个uni包
 * 除login包之外都是uni包，以0x0b开头
 * login包以0x0a开头
 */
Client.prototype.writeUni = function (cmd, body, seq = 0) {
    ++this.stat.sent_pkt_cnt;
    this._socket.write(this._buildUniPacket(cmd, body, seq));
};

/**
 * 发送一个uni包并返回响应包
 */
Client.prototype.sendUni = function (cmd, body, timeout = 5) {
    return this.send(this._buildUniPacket(cmd, body), timeout);
};

/**
 * 发送一个oidb包并返回响应包
 * 是uni包的一个封装
 */
Client.prototype.sendOidb = function (cmd, body) {
    const sp = cmd //OidbSvc.0x568_22
        .replace("OidbSvc.", "")
        .replace("oidb_", "")
        .split("_");
    const type1 = parseInt(sp[0], 16),
        type2 = parseInt(sp[1]);
    body = pb.encode({
        1: type1,
        2: isNaN(type2) ? 1 : type2,
        3: 0,
        4: body,
        6: "android " + this.apk.ver,
    });
    return this.sendUni(cmd, body);
};

/**
 * 构造一个uni包
* @param {string} cmd 
* @param {Buffer} body 
*/
Client.prototype._buildUniPacket = function (cmd, body, seq = 0) {
    seq = seq ? seq : this.nextSeq();
    this.logger.trace(`send:${cmd} seq:${seq}`);
    const type = cmd === "wtlogin.exchange_emp" ? 2 : 1;
 
    let len = cmd.length + 20;
    const sso = Buffer.allocUnsafe(len + body.length + 4);
    sso.writeUInt32BE(len, 0);
    sso.writeUInt32BE(cmd.length + 4, 4);
    sso.fill(cmd, 8);
    let offset = cmd.length + 8;
    sso.writeUInt32BE(8, offset);
    sso.fill(this._wt.session_id, offset + 4);
    sso.writeUInt32BE(4, offset + 8);
    sso.writeUInt32BE(body.length + 4, offset + 12);
    sso.fill(body, offset + 16);
 
    const encrypted = tea.encrypt(sso, type === 1 ? this.sig.d2key : BUF16);
    const uin = String(this.uin);
    len = encrypted.length + uin.length + 18;
    const pkt = Buffer.allocUnsafe(len);
    pkt.writeUInt32BE(len, 0);
    pkt.writeUInt32BE(0x0B, 4);
    pkt.writeUInt8(type, 8);
    pkt.writeInt32BE(seq, 9);
    pkt.writeUInt8(0, 13);
    pkt.writeUInt32BE(uin.length + 4, 14);
    pkt.fill(uin, 18);
    pkt.fill(encrypted, uin.length + 18);
    return pkt;
}

/**
 * 构造事件共通属性
 */
Client.prototype.parseEventType = function (name = "") {
    const slice = name.split(".");
    const post_type = slice[0], sub_type = slice[2];
    const data = {
        self_id: this.uin,
        time: timestamp(),
        post_type: post_type,
    };
    const type_name = slice[0] + "_type";
    data[type_name] = slice[1];
    if (sub_type)
        data.sub_type = sub_type;
    return data;
};

/**
 * 触发事件
 */
Client.prototype.em = function (name = "", data = {}) {
    data = Object.assign(this.parseEventType(name), data);
    while (true) {
        this.emit(name, data);
        let i = name.lastIndexOf(".");
        if (i === -1)
            break;
        name = name.slice(0, i);
    }
};

/**
 * 用于消息去重和数据统计
 */
Client.prototype.msgExists = function (from, type, seq, time) {
    if (timestamp() - time >= 60 || time < this.stat.start_time)
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
};

/**
 * 构造私聊消息cookie
 */
Client.prototype.buildSyncCookie = function () {
    const time = timestamp();
    return pb.encode({
        1: time,
        2: time,
        3: this.const1,
        4: this.const2,
        5: randomBytes(4).readUInt32BE(),
        9: randomBytes(4).readUInt32BE(),
        11: randomBytes(4).readUInt32BE(),
        12: this.const3,
        13: time,
        14: 0,
    });
};

/**
 * 消息同步
 */
Client.prototype.pbGetMsg = async function () {
    if (!this.sync_cookie)
        this.sync_cookie = this.buildSyncCookie();
    let body = pb.encode({
        1: 0,
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
            this.sync_cookie = rsp[3].toBuffer();
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
                let from_uin = head[1], to_uin = head[2];
                if (from_uin === this.uin && from_uin !== to_uin)
                    continue;
                if (![33, 38, 85, 141, 166, 167, 208, 529].includes(type))
                    continue;
                if (this.msgExists(from_uin, type, head[5], head[6]))
                    continue;

                //群员入群
                if (type === 33) {
                    (async () => {
                        const group_id = uin2code(from_uin);
                        const user_id = head[15];
                        const nickname = String(head[16]);
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

                //被管理批准入群，建群
                else if (type === 85 || type === 38) {
                    (async () => {
                        const group_id = uin2code(from_uin);
                        const user_id = this.uin;
                        const nickname = this.nickname;
                        const ginfo = (await this.getGroupInfo(group_id)).data;
                        if (!ginfo) return;
                        if (user_id === this.uin) {
                            this.logger.info(`更新了群列表，新增了群：${group_id}`);
                            this.getGroupMemberList(group_id);
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
        return true;
    } catch (e) {
        this.logger.debug("getMsg发生错误。");
        this.logger.debug(e);
        return false;
    }
};
