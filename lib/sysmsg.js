/**
 * 系统消息相关处理(好友请求、群申请、群邀请)
 * 相关api
 */
"use strict";
const pb = require("./pb");

/**
 * @param {number} user_id 
 * @param {BigInt|number} seq 
 */
function _genFriendRequestFlag(user_id, seq) {
    return user_id.toString(16).padStart(8, "0") + seq.toString(16);
}

/**
 * @param {string} flag 
 */
function _parseFriendRequestFlag(flag) {
    const user_id = parseInt(flag.slice(0, 8), 16);
    const seq = BigInt("0x" + flag.slice(8));
    return { user_id, seq };
}

/**
 * @param {number} user_id 
 * @param {number} group_id 
 * @param {BigInt|number} seq 
 * @param {0|1} invite 
 */
function _genGroupRequestFlag(user_id, group_id, seq, invite) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(user_id), buf.writeUInt32BE(group_id, 4);
    return buf.toString("hex") + invite + seq.toString(16);
}

/**
 * @param {string} flag 
 */
function _parseGroupRequestFlag(flag) {
    const user_id = parseInt(flag.slice(0, 8), 16);
    const group_id = parseInt(flag.slice(8, 16), 16);
    const invite = parseInt(flag.slice(16, 17));
    const seq = BigInt("0x" + flag.slice(17));
    return { user_id, group_id, seq, invite };
}

/**
 * @param {import("./ref").Proto} proto 
 * @returns {import("./ref").FriendAddEventData}
 */
function _parseFrdSysMsg(proto) {
    const time = proto[4];
    const user_id = proto[5];
    const nickname = String(proto[50][51].raw);
    const flag = _genFriendRequestFlag(user_id, proto[3]);
    const source = String(proto[50][5].raw);
    const comment = String(proto[50][4].raw);
    const sex = proto[50][67] === 0 ? "male" : (proto[50][67] === 1 ? "famale" : "unknown");
    const age = proto[50][68];
    return { user_id, nickname, source, comment, sex, age, flag, time };
}

/**
 * @param {import("./ref").Proto} proto 
 * @returns {import("./ref").GroupAddEventData | import("./ref").GroupInviteEventData}
 */
function _parseGrpSysMsg(proto) {
    const type = proto[50][12];
    const time = proto[4];
    const group_id = proto[50][10];
    const group_name = String(proto[50][52].raw);
    const data = { time, group_id, group_name };
    let invite = 0;
    if (type === 2) { //invite
        data.user_id = proto[50][11];
        data.nickname = String(proto[50][53].raw);
        data.role = proto[50][13] === 1 ? "member" : "admin";
        invite = 1;
    } else { //add
        data.user_id = proto[5];
        data.nickname = String(proto[50][51].raw);
        data.comment = String(proto[50][4].raw);
        data.inviter_id = proto[50][11];
        // data.actor_id = proto[50][16];
    }
    data.flag = _genGroupRequestFlag(data.user_id, group_id, proto[3], invite);
    return data;
}

const frd_buf = pb.encode({
    1: 20,
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
        const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgNew.Friend", frd_buf);
        const rsp = pb.decode(blob)[9];
        const proto = Array.isArray(rsp) ? rsp[0] : rsp;
        const data = _parseFrdSysMsg(proto);
        if (this.msgExists(data.user_id, 187, proto[3], data.time))
            return;
        this.logger.info(`收到 ${data.user_id}(${data.nickname}) 的加好友请求 (flag: ${data.flag})`);
        this.em("request.friend.add", data);
    } catch (e) {
        this.logger.debug("获取好友请求失败。");
        this.logger.debug(e);
    }
}

const notify_types = { 84: 1, 87: 2, 525: 22 };
const grp_buf = pb.encode({
    1: 20,
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
        const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgNew.Group", grp_buf);
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
        const data = _parseGrpSysMsg(v);
        if (this.msgExists(data.group_id, type, v[3], data.time))
            return;
        if (type === 84 || type === 525) {
            this.logger.info(`用户 ${data.user_id}(${data.nickname}) 请求加入群 ${data.group_id}(${data.group_name}) (flag: ${data.flag})`);
            this.em("request.group.add", data);
        } else if (type === 87) {
            this.logger.info(`用户 ${data.user_id}(${data.nickname}) 邀请你加入群 ${data.group_id}(${data.group_name}) (flag: ${data.flag})`);
            this.em("request.group.invite", data);
        }
    } catch (e) {
        this.logger.debug("获取群请求失败。");
        this.logger.debug(e);
    }
}

/**
 * 获取系统消息
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function getSysMsg() {
    const data = [];

    const frd_tsk = (async () => {
        const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgNew.Friend", frd_buf);
        let rsp = pb.decode(blob)[9];
        if (!Array.isArray(rsp))
            rsp = [rsp];
        for (let proto of rsp) {
            try {
                data.push(Object.assign(this.parseEventType("request.friend.add"), _parseFrdSysMsg(proto)));
            } catch { }
        }
    })();

    const grp_tsk = (async () => {
        const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgNew.Group", grp_buf);
        let rsp = pb.decode(blob)[10];
        if (!Array.isArray(rsp))
            rsp = [rsp];
        for (let proto of rsp) {
            if (proto[50][1] !== 1)
                continue;
            const type = proto[50][12];
            let sub_type;
            if (type === 1 || type === 22) {
                sub_type = "add";
            } else if (type === 2) {
                sub_type = "invite";
            } else {
                continue;
            }
            data.push(Object.assign(this.parseEventType("request.group." + sub_type), _parseGrpSysMsg(proto)));
        }
    })();

    await Promise.all([frd_tsk, grp_tsk]);
    return { result: 0, data };
}

/**
 * 处理好友请求
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function friendAction(flag, approve = true, remark = "", block = false) {
    const { user_id, seq } = _parseFriendRequestFlag(flag);
    const body = pb.encode({
        1: 1,
        2: seq,
        3: user_id,
        4: 1,
        5: 6,
        6: 7,
        8: {
            1: approve ? 2 : 3,
            52: String(remark),
            53: block ? 1 : 0
        },
    });
    const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgAction.Friend", body);
    const rsp = pb.decode(blob)[1];
    return { result: rsp[1], emsg: rsp[2] ? String(rsp[2].raw) : undefined };
}

/**
 * 处理群请求
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function groupAction(flag, approve = true, reason = "", block = false) {
    const { user_id, group_id, seq, invite } = _parseGroupRequestFlag(flag);
    const body = pb.encode({
        1: 1,
        2: seq,
        3: user_id,
        4: 1,
        5: 3,
        6: invite ? 10016 : 31,
        7: invite ? 2 : 1,
        8: {
            1: approve ? 11 : 12,
            2: group_id,
            50: String(reason),
            53: block ? 1 : 0,
        },
    });
    const blob = await this.sendUni("ProfileService.Pb.ReqSystemMsgAction.Group", body);
    const rsp = pb.decode(blob)[1];
    return { result: rsp[1], emsg: rsp[2] ? String(rsp[2].raw) : undefined };
}

module.exports = {
    getNewFriend, getNewGroup,
    getSysMsg, friendAction, groupAction, 
};
