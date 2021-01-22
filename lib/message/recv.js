"use strict";
const { parseMessage, parseC2CFileElem } = require("./parser");
const { genC2CMessageId, genGroupMessageId, timestamp, parseFunString } = require("../common");

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parsePrivateMsg(msg) {

    const head = msg[1], content = msg[2], body = msg[3];
    const type = head[3]; //141|166|167|208|529
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    let sub_type, message_id = "", font = "unknown";

    const sender = Object.assign({ user_id }, this.fl.get(user_id));
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
        const stranger = (await this.getStrangerInfo(user_id, seq % 5 == 0)).data;
        if (stranger) {
            stranger.group_id = sender.group_id;
            Object.assign(sender, stranger);
            if (!this.sl.has(user_id) || timestamp() - time < 5)
                this.sl.set(user_id, stranger);
        }
    }
    try {
        message_id = genC2CMessageId(user_id, seq, body[1][1][3], time);
        font = String(body[1][1][9].raw);
    } catch { }
    if (type === 529) {
        if (head[4] !== 4)
            return;
        var { chain, raw_message } = await parseC2CFileElem.call(this, body[2][1]);
    } else if (body[1] && body[1][2]) {
        var { chain, raw_message } = await parseMessage.call(this, body[1], user_id);
    }
    return {
        sub_type, message_id, user_id,
        message: chain,
        raw_message, font, sender, time,
        auto_reply: !!(content && content[4])
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parseGroupMsg(msg) {

    const head = msg[1], content = msg[2], body = msg[3];
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    let group = head[9],
        group_id = group[1],
        group_name = group[8] ? String(group[8].raw) : undefined;
    if (!group_name) {
        try {
            group_name = this.gl.get(group_id).group_name;
        } catch { }
    }

    this.msgExists(group_id, 0, seq, time);

    this.getGroupInfo(group_id);

    var { chain, raw_message, extra, anon } = await parseMessage.call(this, body[1], group_id, 1);

    let font = String(body[1][1][9].raw),
        card = parseFunString(group[4].raw);

    let anonymous = null, user = null;
    if (user_id === 80000000 && anon) {
        try {
            anonymous = {
                id: anon[6],
                name: String(anon[3].raw),
            };
            anonymous.flag = anonymous.name + "@" + anon[2].raw.toString("base64");
        } catch {
            this.logger.debug("解析匿名失败");
            this.logger.debug(anon.raw);
        }
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            if (time >= user.last_sent_time) {
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
                user.last_sent_time = time;
                this.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) { }
    }

    if (user) {
        var { nickname, sex, age, area, level, role, title } = user;
    } else {
        var nickname = card, sex = "unknown", age = 0, area = "", level = 0, role = "member", title = "";
    }
    const sender = {
        user_id, nickname, card, sex, age, area, level, role, title
    };
    return {
        sub_type: anonymous ? "anonymous" : "normal",
        group_id, group_name, user_id, anonymous, //message_id
        message: chain,
        raw_message, font, sender, time
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parseDiscussMsg(msg) {

    const head = msg[1], body = msg[3];
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    const discuss = head[13],
        discuss_id = discuss[1],
        discuss_name = String(discuss[5].raw);

    this.msgExists(discuss_id, 0, seq, time);

    const font = String(body[1][1][9].raw),
        card = String(discuss[4].raw),
        nickname = card;

    const sender = {
        user_id, nickname, card
    };

    const { chain, raw_message } = await parseMessage.call(this, body[1], discuss_id);

    return {
        discuss_id, discuss_name, user_id,
        message: chain,
        raw_message, font, sender, time
    };
}

module.exports = {
    parsePrivateMsg, parseGroupMsg, parseDiscussMsg
};
