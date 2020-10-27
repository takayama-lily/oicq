"use strict";
const {toInt} = require("./common");
const pb = require("./pb");

function genFriendRequestFlag(user_id, seq) {
    const buf = Buffer.allocUnsafe(12);
    buf.writeUInt32BE(user_id), buf.writeInt32BE(seq.low, 4), buf.writeInt32BE(seq.high, 8);
    return buf.toString("base64");
}
function parseFriendRequestFlag(flag) {
    const buf = Buffer.from(flag, "base64");
    const user_id = buf.readUInt32BE(), low = buf.readInt32BE(4), high = buf.readInt32BE(8);
    return {user_id, low, high};
}
function genGroupRequestFlag(user_id, group_id, seq, invite) {
    const buf = Buffer.allocUnsafe(17);
    buf.writeUInt32BE(user_id), buf.writeUInt32BE(group_id, 4);
    buf.writeInt32BE(seq.low, 8), buf.writeInt32BE(seq.high, 12), buf.writeInt8(invite, 16);
    return buf.toString("base64");
}
function parseGroupRequestFlag(flag) {
    const buf = Buffer.from(flag, "base64");
    const user_id = buf.readUInt32BE(), group_id = buf.readUInt32BE(4);
    const low = buf.readInt32BE(8), high = buf.readInt32BE(12);
    return {user_id, group_id, low, high, invite: buf[16]};
}

/**
 * 获取好友请求
 * @this {import("./ref").Client}
 */
async function getNewFriend() {
    this.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    10,
        version:   1000,
        checktype: 2,
        flag: {
            frdMsgDiscuss2ManyChat:       1,
            frdMsgGetBusiCard:            1,
            frdMsgNeedWaitingMsg:         1,
            frdMsgUint32NeedAllUnreadMsg: 1,
            grpMsgMaskInviteAutoJoin:     1,
        },
        language: 0,
        isGetFrdRibbon: 0,
        isGetGrpRibbon: 0,
        friendMsgTypeFlag: 1,
    });
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Friend", body);
        const o = pb.decode("RspSystemMsgNew", blob);
        const v = o.friendmsgs[0];
        const time = toInt(v.msgTime);
        const user_id = toInt(v.reqUin);
        const flag = genFriendRequestFlag(user_id, v.msgSeq);
        this.logger.info(`收到 ${user_id}(${v.msg.reqUinNick}) 的加好友请求 (flag: ${flag})`);
        this.em("request.friend.add", {
            user_id,
            nickname:   v.msg.reqUinNick,
            source:     v.msg.msgSource,
            comment:    v.msg.msgAdditional,
            sex:        v.msg.reqUinGender===0?"male":(v.msg.reqUinGender===1?"famale":"unknown"),
            age:        v.msg.reqUinAge,
            flag, time
        });
    } catch (e) {
        this.logger.debug("获取好友请求失败。");
        this.logger.debug(e);
    }
}

/**
 * 获取群请求
 * @this {import("./ref").Client}
 */
async function getNewGroup() {
    this.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    10,
        version:   1000,
        checktype: 3,
        flag: {
            grpMsgKickAdmin:                   1,
            grpMsgHiddenGrp:                   1,
            grpMsgWordingDown:                 1,
            grpMsgGetOfficialAccount:          1,
            grpMsgGetPayInGroup:               1,
            frdMsgDiscuss2ManyChat:            1,
            grpMsgNotAllowJoinGrpInviteNotFrd: 1,
            frdMsgNeedWaitingMsg:              1,
            frdMsgUint32NeedAllUnreadMsg:      1,
            grpMsgNeedAutoAdminWording:        1,
            grpMsgGetTransferGroupMsgFlag:     1,
            grpMsgGetQuitPayGroupMsgFlag:      1,
            grpMsgSupportInviteAutoJoin:       1,
            grpMsgMaskInviteAutoJoin:          1,
            grpMsgGetDisbandedByAdmin:         1,
            grpMsgGetC2CInviteJoinGroup:       1,
        },
        language: 0,
        isGetFrdRibbon: 0,
        isGetGrpRibbon: 0,
        friendMsgTypeFlag: 1,
    });
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Group", body);
        const o = pb.decode("RspSystemMsgNew", blob);
        let v = o.groupmsgs.shift();
        for (let vv of o.groupmsgs) {
            if (v.msg.subType !== 1)
                v = vv;
            else if (vv.msg.subType === 1 && toInt(vv.msgTime) > toInt(v.msgTime))
                v = vv;
        }
        const time = toInt(v.msgTime);
        const group_id = toInt(v.msg.groupCode); 
        if (v.msg.groupMsgType === 1) {
            const user_id = toInt(v.reqUin);
            const flag = genGroupRequestFlag(user_id, group_id, v.msgSeq);
            this.logger.info(`用户 ${user_id}(${v.msg.reqUinNick}) 请求加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
            this.em("request.group.add", {
                group_id, user_id,
                group_name: v.msg.groupName,
                nickname:   v.msg.reqUinNick,
                comment:    v.msg.msgAdditional,
                flag, time
            });
        } else if (v.msg.groupMsgType === 2) {
            const user_id = toInt(v.msg.actionUin);
            const flag = genGroupRequestFlag(user_id, group_id, v.msgSeq, 1);
            this.logger.info(`用户 ${user_id}(${v.msg.actionUinNick}) 邀请你加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
            this.em("request.group.invite", {
                group_id, user_id,
                group_name: v.msg.groupName,
                nickname:   v.msg.actionUinNick,
                role:       v.msg.groupInviterRole === 1 ? "member" : "admin",
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
    const {user_id, low, high} = parseFriendRequestFlag(flag);
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
        msgSeq:     {low, high, unsigned: false},
        reqUin:     user_id,
        subType:    1,
        srcId:      6,
        subSrcId:   7,
        actionInfo: {
            type:       approve?2:3,
            blacklist:  block?true:false
        },
    });
    const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgAction.Friend", body);
    const o = pb.decode("RspSystemMsgAction", blob);
    return {result: o.head.result, emsg: o.head.msgFail};
}

/**
 * 处理群请求
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function groupAction(flag, approve = true, reason = "", block = false) {
    const {user_id, group_id, low, high, invite} = parseGroupRequestFlag(flag);
    const body = pb.encode("ReqSystemMsgAction", {
        msgType:    1,
        msgSeq:     {low, high, unsigned: false},
        reqUin:     user_id,
        subType:    1,
        srcId:      3,
        subSrcId:   invite?10016:31,
        groupMsgType:   invite?2:1,
        actionInfo: {
            type:       approve?11:12,
            groupCode:  group_id,
            blacklist:  block?true:false,
            msg:        String(reason),
        },
    });
    const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgAction.Group", body);
    const o = pb.decode("RspSystemMsgAction", blob);
    return {result: o.head.result, emsg: o.head.msgFail};
}

module.exports = {
    getNewFriend, getNewGroup, friendAction, groupAction
};
