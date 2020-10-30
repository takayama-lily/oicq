"use strict";
const {uinAutoCheck} = require("./common");
const pb = require("./pb");
const jce = require("./jce");

async function setAdmin(group_id, user_id, enable = true) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    this.nextSeq();
    const buf = Buffer.allocUnsafe(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable?1:0, 8);
    const blob = await this.sendUNI("OidbSvc.0x55c_1", buf);
    const result = pb.decode("OIDBSSOPkg", blob).result;
    if (result === 0) {
        try {
            const old_role = this.gml.get(group_id).get(user_id).role;
            const new_role = enable ? "admin" : "member";
            if (old_role !== new_role && old_role !== "owner") {
                this.gml.get(group_id).get(user_id).role = new_role;
                this.em("notice.group.admin", {
                    group_id, user_id, set: !!enable
                });
            }
        } catch (e) {}
    }
    return {result};
}

async function setTitle(group_id, user_id, title = "", duration = -1) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    duration = duration&0xffffffff;
    this.nextSeq();
    title = Buffer.from(String(title));
    duration = parseInt(duration);
    const body = pb.encode("D8FCReqBody", {
        groupCode: group_id,
        memLevelInfo: [{
            uin: user_id,
            uinName: title,
            specialTitle: title,
            specialTitleExpireTime: duration?duration:-1
        }]
    });
    const blob = await this.sendUNI("OidbSvc.0x8fc_2", body);
    return pb.decode("OIDBSSOPkg", blob);
}

async function doSetting(group_id, k, v) {
    var [group_id] = uinAutoCheck(group_id);
    this.nextSeq();
    const qwerty = {
        groupCode: parseInt(group_id),
		stGroupInfo: {},
    };
    qwerty.stGroupInfo[k] = v;
    const body = pb.encode("D89AReqBody", qwerty);
    await this.sendUNI("OidbSvc.0x89a_0", body);
}

async function setCard(group_id, user_id, card = "") {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, String(card), 0, "", "", ""
            ])
        ]
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "ModifyGroupCardReq",
    };
    const body = jce.encodeWrapper({MGCREQ}, extra);
    const blob = await this.sendUNI("friendlist.ModifyGroupCardReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const result = parent[3].length > 0 ? 0 : 1;
    return {result};
}

async function kickMember(group_id, user_id, block = false) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    this.nextSeq();
    const body = pb.encode("D8A0ReqBody", {
        optUint64GroupCode: group_id,
        msgKickList:        [{
            optUint32Operate:   5,
            optUint64MemberUin: user_id,
            optUint32Flag:      block?1:0,
        }],
    });
    const blob = await this.sendUNI("OidbSvc.0x8a0_0", body);
    const o = pb.decode("D8A0RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
    const result = o.msgKickResult[0].optUint32Result;
    if (result === 0 && this.gml.has(group_id) && this.gml.get(group_id).delete(user_id)) {
        this.em("notice.group.decrease", {
            group_id, user_id,
            operator_id: this.uin,
            dismiss: false
        });
    }
    return {result};
}

async function muteMember(group_id, user_id, duration = 1800) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    duration = parseInt(duration);
    if (duration > 2592000 || duration < 0)
        duration = 2592000;
    this.nextSeq();
    const buf = Buffer.allocUnsafe(15);
    buf.writeUInt32BE(group_id), buf.writeUInt8(32, 4), buf.writeUInt16BE(1, 5);
    buf.writeUInt32BE(user_id, 7), buf.writeUInt32BE(duration?duration:0, 11);
    await this.sendUNI("OidbSvc.0x570_8", buf);
}

async function quitGroup(group_id, dismiss = false) {
    var [group_id] = uinAutoCheck(group_id);
    let command, buf = Buffer.allocUnsafe(8);
    if (dismiss) {
        command = 9;
        buf.writeUInt32BE(group_id), buf.writeUInt32BE(this.uin, 4);
    } else {
        command = 2;
        buf.writeUInt32BE(this.uin), buf.writeUInt32BE(group_id, 4);
    }
    const GroupMngReq = jce.encodeStruct([
        command, this.uin, buf
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GroupMngReq",
    };
    const body = jce.encodeWrapper({GroupMngReq}, extra);
    const blob = await this.sendUNI("ProfileService.GroupMngReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[1]};
}

async function pokeMember(group_id, user_id) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    this.nextSeq();
    const body = pb.encode("DED3ReqBody", {
        toUin: user_id,
        groupCode: group_id
    });
    await this.sendUNI("OidbSvc.0xed3", body);
}

async function addGroup(group_id, comment = "") {
    var [group_id] = uinAutoCheck(group_id);
    comment = Buffer.from(String(comment)).slice(0, 255);
    const buf = Buffer.allocUnsafe(9 + comment.length);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(this.uin, 4), buf.writeUInt8(comment.length, 8);
    buf.fill(comment, 9);
    const GroupMngReq = jce.encodeStruct([
        1,
        this.uin, buf, 0, "", 0, 3, 30002, 0, 0, 0,
        null, "", null, "", "", 0
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GroupMngReq",
    };
    const body = jce.encodeWrapper({GroupMngReq}, extra);
    const blob = await this.sendUNI("ProfileService.GroupMngReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[1]};
}

async function inviteFriend(group_id, user_id) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    this.nextSeq();
    const body = pb.encode("D758ReqBody", {
        groupCode: group_id,
        toUin: {
            uin: user_id
        }
    });
    const blob = await this.sendUNI("OidbSvc.oidb_0x758", body);
    const result = pb.decode("OIDBSSOPkg", blob).bodybuffer.length > 6 ? 0 : 1;
    return {result};
}

async function setAnonymous(group_id, enable = true) {
    var [group_id] = uinAutoCheck(group_id);
    this.nextSeq();
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt32BE(group_id), buf.writeUInt8(enable?1:0, 4);
    await this.sendUNI("OidbSvc.0x568_22", buf);
}

module.exports = {
    setAdmin, setTitle, setCard, doSetting, setAnonymous,
    kickMember, muteMember, pokeMember, quitGroup, addGroup, inviteFriend, 
};
