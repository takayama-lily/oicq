"use strict";
const pb = require("../pb");
const {parseC2CMessageId, parseGroupMessageId} = require("../common");

/**
 * @this {import("../ref").Client}
 */
async function getC2CMsg(message_id, num = 10) {
    const {user_id, time, random} = parseC2CMessageId(message_id);
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
    if (!Array.isArray(o[6]))
        o[6] = [o[6]];
    for (let i = o[6].length - 1; i >= 0; --i) {
        const v = o[6][i];
        if (v[3][1] && v[3][1][1] && v[3][1][1][3] === random)
            return v;
    }
    throw new Error("msg not found");
}

/**
 * @this {import("../ref").Client}
 */
async function getGroupMsg(message_id) {
    const {group_id, seq} = parseGroupMessageId(message_id);
    return await getGroupMsgBySeq.call(this, group_id, seq);
}

/**
 * @this {import("../ref").Client}
 */
async function getGroupMsgBySeq(group_id, seq) {
    const body = pb.encode({
        1: group_id,
        2: seq,
        3: seq,
        6: 0
    });
    const blob = await this.sendUNI("MessageSvc.PbGetGroupMsg", body);
    const o = pb.decode(blob);
    if (o[1] > 0)
        throw new Error("msg not exists");
    return o[6];
}

module.exports = {
    getC2CMsg, getGroupMsg, getGroupMsgBySeq
};
