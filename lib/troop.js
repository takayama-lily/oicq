"use strict";
const {uinAutoCheck} = require("./common");
const pb = require("./pb2");
const jce = require("./jce");

async function setAdmin(group_id, user_id, enable = true) {
    var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const buf = Buffer.allocUnsafe(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable?1:0, 8);
    const blob = await this.sendUNI("OidbSvc.0x55c_1", buf);
    const result = pb.decode(blob)[3];
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
    title = String(title);
    duration = parseInt(duration);
    const body = pb.encode({
        1: group_id,
        3: [{
            1: user_id,
            7: title,
            5: title,
            6: duration?duration:-1
        }]
    });
    const blob = await this.sendUNI("OidbSvc.0x8fc_2", body);
    return {result: pb.decode(blob)[3]};
}

async function doSetting(group_id, k, v) {
    var [group_id] = uinAutoCheck(group_id);
    const settings = {
        shutupTime: 17,
        ingGroupName: 3,
        ingGroupMemo: 4,
    }
    const tag = settings[k];
    if (!tag)
        throw new Error("unknown setting key");
    const body = {
        1: group_id,
        2: {},
    };
    body[2][tag] = v;
    await this.sendUNI("OidbSvc.0x89a_0", pb.encode(body));
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
        req_id:  this.seq_id + 1,
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
    const body = pb.encode({
        1: group_id,
        2: [{
            1: 5,
            2: user_id,
            3: block?1:0,
        }],
    });
    const blob = await this.sendUNI("OidbSvc.0x8a0_0", body);
    const o = pb.decode(blob)[4];
    const result = o[2][1];
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
        req_id:  this.seq_id + 1,
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
    const body = pb.encode({
        1: user_id,
        2: group_id
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
        req_id:  this.seq_id + 1,
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
    const body = pb.encode({
        1: group_id,
        2: {1: user_id}
    });
    const blob = await this.sendUNI("OidbSvc.oidb_0x758", body);
    const result = pb.decode(blob)[4].raw.length > 6 ? 0 : 1;
    return {result};
}

async function setAnonymous(group_id, enable = true) {
    var [group_id] = uinAutoCheck(group_id);
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt32BE(group_id), buf.writeUInt8(enable?1:0, 4);
    await this.sendUNI("OidbSvc.0x568_22", buf);
}

module.exports = {
    setAdmin, setTitle, setCard, doSetting, setAnonymous,
    kickMember, muteMember, pokeMember, quitGroup, addGroup, inviteFriend, 
};
