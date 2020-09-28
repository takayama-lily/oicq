"use strict";
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const toInt = common.toInt;

/**
 * @param {Number} svrip
 * @param {Number} seq
 * @param {Buffer[]} rubbish 
 */
function handleOnlinePush(svrip, seq, rubbish) {
    this.nextSeq();
    const resp = jce.encodeStruct([
        this.uin, rubbish, svrip, null, 0
    ]);
    const extra = {
        req_id:  seq,
        service: "OnlinePush",
        method:  "SvcRespPushMsg",
    };
    const body = jce.encodeWrapper({resp}, extra);
    this.writeUNI("OnlinePush.RespPush", body);
}

function onOnlinePush(blob, seq) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const list = parent[2];
    const rubbish = [];
    for (let v of list) {
        v = jce.decode(v);
        rubbish.push(jce.encodeNested([
            this.uin, v[1], v[3], v[8], 0,0,0,0,0,0,0
        ]))
        if (!this.sync_finished) continue;
        const time = v[5];
        if (v[2] === 528) {
            let data = jce.decode(v[6]);
            if (data[0] === 0x8A || data[0] === 0x8B) {
                data = pb.decode("Sub8A", data[10]);
                data = data.msgInfo[0];
                const user_id = toInt(data.fromUin);
                common.emit(this, "notice.friend.recall", {
                    user_id, message_id: common.genGroupMessageId(user_id, data.msgSeq, data.msgRandom)
                });
            } else if (data[0] === 0xB3) {
                data = pb.decode("SubB3", data[10]);
                const user_id = toInt(data.msgAddFrdNotify.uin), nickname = data.msgAddFrdNotify.nick;
                this.fl.set(user_id, {
                    user_id, nickname,
                    sex: "unknown",
                    age: 0,
                    area: "unknown",
                    remark: nickname,
                });
                this.sl.delete(user_id);
                this.getStrangerInfo(user_id);
                this.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`);
                common.emit(this, "notice.friend.increase", {
                    user_id, nickname
                });
            } else if (data[0] === 0xD4) {
                data = pb.decode("SubD4", data[10]);
                const group_id = toInt(data.groupCode);
                this.getGroupInfo(group_id, true);
            }
            if (data[0] === 0x3B) {
                data = pb.decode("Sub3B", data[10])
                const group_id = toInt(data.groupCode);
                common.emit(this, "notice.group.setting", {
                    group_id, user_id: -1,
                    enable_show_title: data.enableShowTitle > 0
                });
            }
            if (data[0] === 0x44) {}
            if (data[0] === 0x27) {
                data = pb.decode("Sub27", data[10]).sub27[0];
                if (data.type === 80) {
                    const o = data.msgNewGrpName;
                    const group_id = toInt(o.groupCode);
                    if (!o.authUin)
                        continue;
                    try {
                        this.gl.get(group_id).group_name = o.entry.name;
                    } catch (e) {}
                    common.emit(this, "notice.group.setting", {
                        group_id,
                        user_id: toInt(o.authUin),
                        group_name: o.entry.name
                    });
                }
                if (data.type === 5) {
                    let user_id = toInt(data.msgDelFrdNotify.uin), nickname = null;
                    try {
                        nickname = this.fl.get(user_id).nickname;
                        this.fl.delete(user_id);
                    } catch (e) {}
                    this.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`);
                    common.emit(this, "notice.friend.decrease", {
                        user_id, nickname
                    });
                }
                if (data.type === 20) {
                    // 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡
                    const user_id = toInt(data.msgProfile.uin);
                    const o = data.msgProfile.profile;
                    let key, value;
                    if (o.type === 20002) {
                        key = "nickname";
                        value = o.value.toString();
                    } else if (o.type === 20009) {
                        key = "sex";
                        value = friend_sex_map[o.value[0]];
                    } else if (o.type === 20031) {
                        key = "age";
                        value = new Date().getFullYear() - o.value.readUInt16BE();
                    } else if (o.type === 20019) {
                        key = "description";
                        value = o.value.toString();
                    } else {
                        continue;
                    }
                    try {
                        this.fl.get(user_id)[key] = value;
                    } catch (e) {}
                    if (user_id === this.uin)
                        this[key] = value;
                    else {
                        const e = {user_id};
                        e[key] = value;
                        common.emit(this, "notice.friend.profile", e);
                    }
                }
                if (data.type === 60) {
                    const user_id = toInt(data.msgNewSign.uin);
                    const sign = data.msgNewSign.sign;
                    try {
                        this.fl.get(user_id).signature = sign;
                    } catch (e) {}
                    if (user_id === this.uin)
                        this.signature = sign;
                    else
                        common.emit(this, "notice.friend.profile", {
                            user_id, signature: sign
                        });
                }
                if (data.type === 40) {
                    try {
                        const o = data.msgNewRemark.entry, uin = toInt(o.uin);
                        if (o.type > 0) continue; //0好友备注 1群备注
                        this.fl.get(uin).remark = o.remark;
                    } catch (e) {}
                }
                if (data.type === 21) {
                    // 群头像增加 <Buffer 0a 1a 08 00 10 15 5a 14 08 01 10 9f dd 95 a1 04 18 9f dd 95 a1 04 20 f5 ef e8 b1 01>
                }
                
            }
        } else if (v[2] === 732) {
            const group_id = v[6].readUInt32BE();
            if (v[6][4] === 0x0C) {
                const operator_id = v[6].readUInt32BE(6);
                const user_id = v[6].readUInt32BE(16);
                const duration = v[6].readUInt32BE(20);
                try {
                    if (user_id === 0)
                        this.gl.get(group_id).shutup_time_whole = duration & 0xffffffff;
                    else if (user_id === this.uin)
                        this.gl.get(group_id).shutup_time_me = duration ? (time + duration) : 0;
                } catch (e) {}
                common.emit(this, "notice.group.ban", {
                    group_id, operator_id, user_id, duration
                });
            }
            if (v[6][4] === 0x11) {
                const data = pb.decode("NotifyMsgBody", v[6].slice(7));
                const operator_id = toInt(data.optMsgRecall.uin);
                const msg = data.optMsgRecall.recalledMsgList[0];
                const user_id = toInt(msg.authorUin);
                const message_id = common.genGroupMessageId(group_id, msg.seq, msg.msgRandom);
                common.emit(this, "notice.group.recall", {
                    group_id, user_id, operator_id, message_id
                });
            }
            if (v[6][4] === 0x14) {
                const data = pb.decode("NotifyMsgBody", v[6].slice(7));
                if (data.optGeneralGrayTip) {
                    let user_id, operator_id, action, suffix;
                    for (let k in data.optGeneralGrayTip.msgTemplParam) {
                        const o = data.optGeneralGrayTip.msgTemplParam[k]
                        if (o.name === "action_str")
                            action = o.value;
                        if (o.name === "uin_str1")
                            operator_id = parseInt(o.value);
                        if (o.name === "uin_str2")
                            user_id = parseInt(o.value);
                        if (o.name === "suffix_str")
                            suffix = o.value;
                    }
                    if (!operator_id)
                        continue;
                    if (!user_id)
                        user_id = this.uin;
                    common.emit(this, "notice.group.poke", {
                        group_id, user_id, operator_id, action, suffix
                    });
                }
            }

            const o = v[6];
            let user_id, field, enable;
            if (o[4] === 0x06 && o[5] === 1) {
                field = "enable_guest", enable = o[10] > 0;
                user_id = o.readUInt32BE(6);
            }
            else if (o[4] === 0x0e && o[5] === 1) {
                field = "enable_anonymous", enable = o[10] === 0;
                user_id = o.readUInt32BE(6);
            }
            else if (o[4] === 0x0f) {
                if (o[12] === 1)
                    field = "enable_upload_album";
                else if (o[12] === 2)
                    field = "enable_upload_file";
                enable = o[8] === 0x0 || o[8] === 0x20;
                user_id = this.gl.get(group_id).owner_id;
            }
            else if (o[4] === 0x10) {
                const sub = pb.decode("Sub10", o.slice(7));
                if (sub.entry && sub.entry.text) {
                    let str = sub.entry.text;
                    user_id = str.includes("群主") ? this.gl.get(group_id).owner_id : -1;
                    if (str.includes("获得群主授予的")) {
                        user_id = toInt(sub.entry.uin);
                        str = str.substr(0, str.length - 2);
                        const title = str.substr(str.lastIndexOf("获得群主授予的") + 7);
                        str = str.substr(0, str.length - title.length - 7);
                        const nickname = str.substr(2);
                        try {
                            this.gml.get(group_id).get(user_id).title = title;
                            this.gml.get(group_id).get(user_id).title_expire_time = -1;
                        } catch(e) {}
                        common.emit(this, "notice.group.title", {
                            group_id, user_id,
                            nickname, title
                        });
                        continue;
                    } else if (str.includes("坦白说")) {
                        field = "enable_confess";
                        enable = str.includes("开启");
                    } else if (str.includes("临时会话")) {
                        field = "enable_temp_chat";
                        enable = str.includes("允许");
                    } else if (str.includes("新的群聊")) {
                        field = "enable_new_group";
                        enable = str.includes("允许");
                    }
                }
                if (o[6] === 0x22) {
                    if (o[o.length - 2] === 0x08)
                        field = "enable_show_honor";
                    if (o[o.length - 2] === 0x10)
                        field = "enable_show_level";
                    enable = o[o.length - 1] === 0;
                    user_id = -1;
                }
                if (o[6] === 0x26) {
                    // 改群分类 <Buffer 44 25 6e 9f 10 00 26 08 18 10 96 8a e3 fa 05 18 ff ff ff ff 0f 20 9f dd 95 a1 04 68 17 a8 01 f5 ef e8 b1 01 f2 01 06 18 8c 04 40 9a 4e>
                }
            } else {
                continue;
            }
            if (field && enable !== undefined) {
                const e = {
                    group_id, user_id
                };
                e[field] = enable;
                common.emit(this, "notice.group.setting", e);
            }
        }
    }
    handleOnlinePush.call(this, parent[3], seq, rubbish);
}

async function onOnlinePushTrans(blob, seq) {
    const o = pb.decode("TransMsgInfo", blob);
    handleOnlinePush.call(this, o.svrIp, seq, []);
    if (!this.sync_finished) return;
    const time = toInt(o.realMsgTime);
    const buf = o.msgData;
    const group_id = buf.readUInt32BE();
    if (o.msgType === 44) {
        if (buf[5] === 0 || buf[5] === 1) {
            const user_id = buf.readUInt32BE(6);
            const set = buf[10] > 0;
            try {
                (await this.getGroupMemberInfo(group_id, user_id)).data.role = (set ? "admin" : "member");
            } catch (e) {}
            common.emit(this, "notice.group.admin", {
                group_id, user_id, set, time
            });
        } else if (buf[5] === 0xFF) {
            const operator_id = buf.readUInt32BE(6);
            const user_id = buf.readUInt32BE(10);
            try {
                this.gl.get(group_id).owner_id = user_id;
                (await this.getGroupMemberInfo(group_id, operator_id)).data.role = "member";
                (await this.getGroupMemberInfo(group_id, user_id)).data.role = "owner";
            } catch (e) {}
            common.emit(this, "notice.group.transfer", {
                group_id, operator_id, user_id, time
            });
        }
    }
    if (o.msgType === 34) {
        const user_id = buf.readUInt32BE(5);
        let operator_id, dismiss = false;
        if (buf[9] === 0x82 || buf[9] === 0x2) {
            operator_id = user_id;
            try {
                this.gml.get(group_id).delete(user_id);
            } catch (e) {}
        } else {
            operator_id = buf.readUInt32BE(10);
            if (buf[9] === 0x01)
                dismiss = true;
            if (user_id === this.uin) {
                this.gl.delete(group_id);
                this.gml.delete(group_id);
                this.logger.info(`更新了群列表，删除了群：${group_id}`);
            } else {
                try {
                    this.gml.get(group_id).delete(user_id);
                } catch (e) {}
            }
        }
        try {
            this.gl.get(group_id).member_count--;
        } catch (e) {}
        common.emit(this, "notice.group.decrease", {
            group_id, user_id, operator_id, dismiss, time
        });
    }
}

module.exports = {
    onOnlinePush, onOnlinePushTrans, handleOnlinePush
};
