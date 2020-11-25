"use strict";
const {parseMessage, parseC2CFileElem} = require("./parser");
const {genC2CMessageId, genGroupMessageId} = require("../common");

/**
 * @param {141|166|167|208|529} type 
 * @this {import("../ref").Client}
 */
async function handlePrivateMsg(type, head, content, body) {
    
    ++this.stat.recv_msg_cnt;
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    let sub_type, message_id = "", font = "unknown";

    const sender = Object.assign({user_id}, this.fl.get(user_id));
    if (type === 141) {
        sub_type = "other";
        if (head[8] && head[8][4]) {
            sub_type = "group";
            sender.group_id = head[8][4];
        }
    } else if (type === 167) {
        sub_type = "single";
    } else {
        sub_type = this.fl.has(user_id) ? "friend" : "single";
    }
    if (sender.nickname === undefined) {
        const stranger = (await this.getStrangerInfo(user_id, seq%5==0)).data;
        if (stranger) {
            stranger.group_id = sender.group_id;
            Object.assign(sender, stranger);
            this.sl.set(user_id, stranger);
        }
    }
    try {
        message_id = genC2CMessageId(user_id, seq, body[1][1][3], time);
        font = String(body[1][1][9].raw);
    } catch {}
    if (type === 529) {
        try {
            if (head[4] !== 4)
                return;
            var {chain, raw_message} = await parseC2CFileElem.call(this, body[2][1]);
        } catch (e) {return}
    } else if (body[1] && body[1][2]) {
        try {
            var {chain, raw_message} = await parseMessage.call(this, body[1], user_id);
        } catch (e) {return}
    }
    if (raw_message) {
        this.logger.info(`recv from: [Private: ${user_id}(${sub_type})] ` + raw_message);
        this.em("message.private." + sub_type, {
            message_id, user_id,
            message: chain,
            raw_message, font, sender, time,
            auto_reply: !!(content&&content[4])
        });
    }
}

/**
 * @this {import("../ref").Client}
 */
async function handleGroupMsg(head, body) {

    ++this.stat.recv_msg_cnt;
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    const group = head[9],
        group_id = group[1],
        group_name = String(group[8].raw);

    this.msgExists(group_id, 0, seq, time);
    const message_id = genGroupMessageId(group_id, user_id, seq, body[1][1][3], time);
    this.emit(`interval.${group_id}.${body[1][1][3]}`, message_id);
    this.getGroupInfo(group_id);

    try {
        var {chain, raw_message, extra, anon} = await parseMessage.call(this, body[1], group_id);
    } catch (e) {return}

    let font = String(body[1][1][9].raw),
        card = String(group[4].raw);

    // 彩色群名片
    if (extra[2]) {
        card = String(extra[2].raw);
        if (card.startsWith("\n"))
            card = card.split("\n").pop().substr(3);
    }

    let anonymous = null, user = null;
    if (user_id === 80000000) {
        anonymous = {
            id: anon[6],
            name: anon[3] ? String(anon[3].raw) : "80000000",
            flag: anon[2] ? anon[2].raw.toString("base64") : ""
        };
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            if (extra[7])
                user.title = String(extra[7].raw);
            if (extra[3])
                user.level = extra[3];
            if (extra[1] && !extra[2]) {
                user.card = card = "";
                user.nickname = String(extra[1].raw);
            } else {
                user.card = card;
            }
            if (time > user.last_sent_time) {
                user.last_sent_time = time;
                this.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) {}
    }

    if (user_id === this.uin && this.config.ignore_self)
        return;
    if (!raw_message)
        return;

    if (user) {
        var {nickname, sex, age, area, level, role, title} = user;
    } else {
        var nickname = card, sex = "unknown", age = 0, area = "", level = 0, role = "member", title = "";
    }
    const sender = {
        user_id, nickname, card, sex, age, area, level, role, title
    };

    const sub_type = anonymous ? "anonymous" : "normal";
    this.logger.info(`recv from: [Group: ${group_name}(${group_id}), Member: ${card?card:nickname}(${user_id})] ` + raw_message);
    this.em("message.group." + sub_type, {
        message_id, group_id, group_name, user_id, anonymous,
        message: chain,
        raw_message, font, sender, time
    });
}

/**
 * @this {import("../ref").Client}
 */
async function handleDiscussMsg(head, body) {

    ++this.stat.recv_msg_cnt;
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    const discuss = head[13],
        discuss_id = discuss[1],
        discuss_name = String(discuss[5].raw);

    this.msgExists(discuss_id, 0, seq, time);

    if (user_id === this.uin && this.config.ignore_self)
        return;

    const font = String(body[1][1][9].raw),
        card = nickname = String(discuss[4].raw);

    const sender = {
        user_id, nickname, card
    };

    try {
        var {chain, raw_message} = await parseMessage.call(this, body[1], discuss_id);
    } catch (e) {return}

    if (!raw_message)
        return;

    this.logger.info(`recv from: [Discuss: ${discuss_name}(${discuss_id}), Member: ${card}(${user_id})] ` + raw_message);
    this.em("message.discuss", {
        discuss_id, discuss_name, user_id,
        message: chain,
        raw_message, font, sender, time
    });
}

module.exports = {
    handlePrivateMsg, handleGroupMsg, handleDiscussMsg
};
