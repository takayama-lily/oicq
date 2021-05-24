/**
 * 扩展Client类
 */
"use strict";

const { randomBytes } = require("crypto");
const { Client } = require("./client");
const pb = require("./algo/pb");
const { timestamp, uin2code } = require("./common");
const { build0x0BPacket } = require("./wtlogin/wt");
const { TimeoutError } = require("./exception");
const { parseC2CMsg } = require("./message/parser");

Client.prototype.nextSeq = function() {
    if (++this.seq_id >= 0x8000)
        this.seq_id = 1;
    return this.seq_id;
};

Client.prototype.send = function (packet, timeout = 5000) {
    ++this.stat.sent_pkt_cnt;
    const seq_id = this.seq_id;
    return new Promise((resolve, reject) => {
        this._socket.write(packet, () => {
            const id = setTimeout(() => {
                this.handlers.delete(seq_id);
                ++this.stat.lost_pkt_cnt;
                reject(new TimeoutError());
                this.emit("internal.timeout", { seq_id, packet });
            }, timeout);
            this.handlers.set(seq_id, (data) => {
                clearTimeout(id);
                this.handlers.delete(seq_id);
                resolve(data);
            });
        });
    });
};

Client.prototype.writeUni = function () {
    ++this.stat.sent_pkt_cnt;
    this._socket.write(build0x0BPacket.apply(this, arguments));
};

Client.prototype.sendUni = function () {
    return this.send(build0x0BPacket.apply(this, arguments));
};

Client.prototype.sendOidb = function (cmd, body) {
    body = pb.encodeOIDB.call(this, cmd, body);
    return this.sendUni(cmd, body);
};

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
