"use strict";
const { Builder } = require("./builder");
const { getOneC2CMsg, getOneGroupMsg } = require("./history");
const { parseC2CMsg, parseGroupMsg } = require("./parser");
const common = require("../common");
const pb = require("../pb");
const { parseC2CMessageId, parseGroupMessageId, genMessageUuid } = common;

//send msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {import("../ref").MessageElem[]|String} message 
 * @param {boolean} escape 
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendTempMsg(group_id, user_id, message, escape) {
    [group_id, user_id] = common.uinAutoCheck(group_id, user_id);
    const builder = new Builder(this, user_id, 0);
    builder.routing = pb.encode({
        3: {
            1: common.code2uin(group_id),
            2: user_id,
        }
    });
    return await builder.buildAndSend(message, escape);
}

/**
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {import("../ref").MessageElem[]|String} message 
 * @param {boolean} escape 
 * @param {0|1|2} type //0私聊 1群聊 2讨论组
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendMsg(target, message, escape, type) {
    [target] = common.uinAutoCheck(target);
    const builder = new Builder(this, target, type);
    return await builder.buildAndSend(message, escape);
}

//recall----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 */
async function recallMsg(message_id) {
    let body;
    try {
        if (message_id.length > 24)
            body = buildRecallGroupMsgBody.call(this, message_id);
        else
            body = buildRecallPrivateMsgBody.call(this, message_id);
    } catch {
        throw new Error("incorrect message_id");
    }
    await this.sendUni("PbMessageSvc.PbMsgWithDraw", body);
}
function buildRecallPrivateMsgBody(message_id) {
    const { user_id, seq, random, time } = parseC2CMessageId(message_id);
    let type = 0;
    try {
        if (this.sl.get(user_id).group_id)
            type = 1;
    } catch (e) { }
    return pb.encode({
        1: [{
            1: [{
                1: this.uin,
                2: user_id,
                3: seq,
                4: genMessageUuid(random),
                5: time,
                6: random,
            }],
            2: 0,
            3: Buffer.from([0x8, type]),
            4: 1,
        }]
    });
}
function buildRecallGroupMsgBody(message_id) {
    var { group_id, seq, random, pktnum } = parseGroupMessageId(message_id);
    if (pktnum > 1) {
        //分片消息
        var msg = [], pb_msg = [], n = pktnum, i = 0;
        while (n-- > 0) {
            msg.push(pb.encode({
                1: seq,
                2: random,
            }));
            pb_msg.push(pb.encode({
                1: seq,
                3: pktnum,
                4: i++
            }));
            ++seq;
        }
        var reserver = {
            1: 1,
            2: pb_msg,
        };
    } else {
        var msg = {
            1: seq,
            2: random,
        };
        var reserver = { 1: 0 };
    }
    return pb.encode({
        2: [{
            1: 1,
            2: 0,
            3: group_id,
            4: msg,
            5: reserver,
        }]
    });
}

//get history msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 */
async function getHistoryMsg(message_id) {
    if (message_id.length > 24) {
        const msg = await getOneGroupMsg.call(this, message_id);
        try {
            const data = await parseGroupMsg.call(this, msg);
            data.post_type = "message";
            data.message_type = "group";
            data.message_id = message_id;
            data.real_id = message_id;
            return { result: 0, data };
        } catch (e) {
            this.logger.debug(e);
            return { result: -1, emsg: "failed to get group msg" };
        }
    } else {
        const msg = await getOneC2CMsg.call(this, message_id);
        try {
            const data = await parseC2CMsg.call(this, msg);
            data.post_type = "message";
            data.message_type = "private";
            data.message_id = message_id;
            data.real_id = message_id;
            return { result: 0, data };
        } catch (e) {
            this.logger.debug(e);
            return { result: -1, emsg: "failed to get c2c msg" };
        }
    }
}

module.exports = {
    sendMsg, sendTempMsg, recallMsg, getHistoryMsg
};
