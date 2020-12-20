"use strict";
const pb = require("./pb");

/**
 * @param {Number} user_id 
 * @param {BigInt|Number} seq 
 */
function genFriendRequestFlag(user_id, seq) {
    return user_id.toString(16).padStart(8, "0") + seq.toString(16);
}

/**
 * @param {String} flag 
 */
function parseFriendRequestFlag(flag) {
    const user_id = parseInt(flag.slice(0, 8), 16);
    const seq = BigInt("0x" + flag.slice(8));
    return {user_id, seq};
}

/**
 * @param {Number} user_id 
 * @param {Number} group_id 
 * @param {BigInt|Number} seq 
 * @param {0|1} invite 
 */
function genGroupRequestFlag(user_id, group_id, seq, invite) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(user_id), buf.writeUInt32BE(group_id, 4);
    return buf.toString("hex") + invite + seq.toString(16);
}

/**
 * @param {String} flag 
 */
function parseGroupRequestFlag(flag) {
    const user_id = parseInt(flag.slice(0, 8), 16);
    const group_id = parseInt(flag.slice(8, 16), 16);
    const invite = parseInt(flag.slice(16, 17));
    const seq = BigInt("0x" + flag.slice(17));
    return {user_id, group_id, seq, invite};
}

const frd_buf = pb.encode({
    1: 10,
    4: 1000,
    5: 2,
    6: {
        4: 1,
        7: 1,
        9: 1,
        10: 1,
        15: 1,
    },
    7: 0,
    8: 0,
    9: 0,
    10: 1,
});

/**
 * 获取好友请求
 * @this {import("./ref").Client}
 */
async function getNewFriend() {
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Friend", frd_buf);
        const rsp = pb.decode(blob)[9];
        const v = Array.isArray(rsp) ? rsp[0] : rsp;
        const time = v[4];
        const user_id = v[5];

        if (this.msgExists(user_id, 187, v[3], time))
            return;

        const nickname = String(v[50][51].raw);
        const flag = genFriendRequestFlag(user_id, v[3]);
        this.logger.info(`收到 ${user_id}(${nickname}) 的加好友请求 (flag: ${flag})`);
        this.em("request.friend.add", {
            user_id, nickname,
            source: String(v[50][5].raw),
            comment: String(v[50][4].raw),
            sex: v[50][67]===0?"male":(v[50][67]===1?"famale":"unknown"),
            age: v[50][68],
            flag, time
        });
    } catch (e) {
        this.logger.debug("获取好友请求失败。");
        this.logger.debug(e);
    }
}

const notify_types = {84:1,87:2,525:22};
const grp_buf = pb.encode({
    1: 10,
    4: 1000,
    5: 3,
    6: {
        1: 1,
        2: 1,
        3: 1,
        5: 1,
        6: 1,
        7: 1,
        8: 1,
        9: 1,
        10: 1,
        11: 1,
        12: 1,
        13: 1,
        14: 1,
        15: 1,
        16: 1,
        17: 1,
    },
    7: 0,
    8: 0,
    9: 0,
    10: 1,
});

/**
 * 获取群请求
 * @this {import("./ref").Client}
 * @param {84|87|525} type 84申请 87邀请 525申请(来自群员的邀请)
 */
async function getNewGroup(type) {
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Group", grp_buf);
        const rsp = pb.decode(blob)[10];
        let v;
        if (!Array.isArray(rsp))
            v = rsp;
        else {
            for (let vv of rsp) {
                if (vv[50][1] !== 1 || vv[50][12] !== notify_types[type])
                    continue;
                if (!v || vv[4] > v[4])
                    v = vv;
            }
        }
        if (!v) return;
        const time = v[4];
        const group_id = v[50][10];

        if (this.msgExists(group_id, type, v[3], time))
            return;

        if (type === 84 || type === 525) {
            const user_id = v[5];
            const nickname = String(v[50][51].raw);
            const group_name = String(v[50][52].raw);
            const flag = genGroupRequestFlag(user_id, group_id, v[3], 0);
            this.logger.info(`用户 ${user_id}(${nickname}) 请求加入群 ${group_id}(${group_name}) (flag: ${flag})`);
            this.em("request.group.add", {
                group_id, user_id, group_name, nickname,
                comment: String(v[50][4].raw),
                inviter_id: type === 525 ? v[50][11] : undefined,
                flag, time
            });
        } else if (type === 87) {
            const user_id = v[50][11];
            const nickname = String(v[50][53].raw);
            const group_name = String(v[50][52].raw);
            const flag = genGroupRequestFlag(user_id, group_id, v[3], 1);
            this.logger.info(`用户 ${user_id}(${nickname}) 邀请你加入群 ${group_id}(${group_name}) (flag: ${flag})`);
            this.em("request.group.invite", {
                group_id, user_id, group_name, nickname,
                role: v[50][13] === 1 ? "member" : "admin",
                flag, time
            });
        }
    } catch (e) {
        this.logger.debug("获取群请求失败。");
        this.logger.debug(e);
    }
}

/**
 * 处理好友请求
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function friendAction(flag, approve = true, remark = "", block = false) {
    const {user_id, seq} = parseFriendRequestFlag(flag);
    const body = pb.encode({
        1: 1,
        2: seq,
        3: user_id,
        4: 1,
        5: 6,
        6: 7,
        8: {
            1: approve?2:3,
            52: String(remark),
            53: block?1:0
        },
    });
    const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgAction.Friend", body);
    const rsp = pb.decode(blob)[1];
    return {result: rsp[1], emsg: rsp[2]?String(rsp[2].raw):undefined};
}

/**
 * 处理群请求
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function groupAction(flag, approve = true, reason = "", block = false) {
    const {user_id, group_id, seq, invite} = parseGroupRequestFlag(flag);
    const body = pb.encode({
        1: 1,
        2: seq,
        3: user_id,
        4: 1,
        5: 3,
        6: invite?10016:31,
        7: invite?2:1,
        8: {
            1: approve?11:12,
            2: group_id,
            50: String(reason),
            53: block?1:0,
        },
    });
    const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgAction.Group", body);
    const rsp = pb.decode(blob)[1];
    return {result: rsp[1], emsg: rsp[2]?String(rsp[2].raw):undefined};
}

module.exports = {
    getNewFriend, getNewGroup, friendAction, groupAction
};
