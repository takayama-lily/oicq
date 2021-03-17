/**
 * 聊天记录获取协议
 */
"use strict";
const pb = require("../pb");

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
    const blob = await this.sendUni("MessageSvc.PbGetOneDayRoamMsg", body);
    const o = pb.decode(blob);
    if (o[1] > 0)
        throw new Error("msg not exists");
    return Array.isArray(o[6]) ? o[6] : [o[6]];
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
    const blob = await this.sendUni("MessageSvc.PbGetGroupMsg", body);
    const o = pb.decode(blob);
    if (o[1] > 0)
        throw new Error("msg not exists");
    return Array.isArray(o[6]) ? o[6] : [o[6]];
}

module.exports = {
    getC2CMsgs, getGroupMsgs
};
