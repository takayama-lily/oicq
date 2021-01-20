"use strict";
const pb = require("../pb");
const { parseC2CMessageId, parseGroupMessageId } = require("../common");

/**
 * @this {import("../ref").Client}
 * @param {number} user_id 
 * @param {number} time 
 * @param {number} num 
 * @returns {Promise<import("../ref").Msg[]>}
 */
async function getC2CMsgs(user_id, time, num) {
    const body = pb.encode({
        1: user_id,
        2: time,
        3: 0,
        4: num
    });
    const blob = await this.sendUNI("MessageSvc.PbGetOneDayRoamMsg", body);
    const o = pb.decode(blob);
    if (o[1] > 0)
        throw new Error("msg not exists");
    return Array.isArray(o[6]) ? o[6] : [o[6]];
}

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 * @returns {Promise<import("../ref").Msg>}
 */
async function getOneC2CMsg(message_id) {
    const { user_id, time, random } = parseC2CMessageId(message_id);
    const msgs = await getC2CMsgs.call(this, user_id, time, 10);
    for (let i = msgs.length - 1; i >= 0; --i) {
        const v = msgs[i];
        if (v[3][1] && v[3][1][1] && v[3][1][1][3] === random)
            return v;
    }
    throw new Error("msg not found");
}

/**
 * @this {import("../ref").Client}
 * @param {number} group_id 
 * @param {number} from_seq 
 * @param {number} to_seq 
 * @returns {Promise<import("../ref").Msg[]>}
 */
async function getGroupMsgs(group_id, from_seq, to_seq) {
    const body = pb.encode({
        1: group_id,
        2: from_seq,
        3: to_seq,
        6: 0
    });
    const blob = await this.sendUNI("MessageSvc.PbGetGroupMsg", body);
    const o = pb.decode(blob);
    if (o[1] > 0)
        throw new Error("msg not exists");
    return Array.isArray(o[6]) ? o[6] : [o[6]];
}

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 * @returns {Promise<import("../ref").Msg>}
 */
async function getOneGroupMsg(message_id) {
    const { group_id, seq } = parseGroupMessageId(message_id);
    const msgs = await getGroupMsgs.call(this, group_id, seq, seq);
    return msgs[0];
}

module.exports = {
    getOneC2CMsg, getOneGroupMsg, getC2CMsgs, getGroupMsgs
};
