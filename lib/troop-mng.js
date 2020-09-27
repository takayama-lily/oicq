"use strict";
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const BUF0 = Buffer.alloc(0);

//individual----------------------------------------------------------------------------------------------------

async function sendLike(user_id, times) {
    this.nextSeq();
    const ReqFavorite = jce.encodeStruct([
        jce.encodeNested([
            this.uin, 1, this.seq_id, 1, 0, Buffer.from("0C180001060131160131", "hex")
        ]),
        user_id, 0, 1, times
    ]);
    const extra = {
        req_id:  this.seq_id,
        service: "VisitorSvc",
        method:  "ReqFavorite",
    };
    const body = jce.encodeWrapper({ReqFavorite}, extra);
    const blob = await this.sendUNI("VisitorSvc.ReqFavorite", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: jce.decode(parent[0])[3]};
}

async function getAddSetting(user_id) {
    const FS = jce.encodeStruct([
        this.uin,
        user_id, 3004, 0, null, 1
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetUserAddFriendSettingReq",
    };
    const body = jce.encodeWrapper({FS}, extra);
    const blob = await this.sendUNI("friendlist.getUserAddFriendSetting", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    if (parent[4]) return false;
    return parent[2];
}

async function addFriend(type, group_id, user_id, comment) {
    const AF = jce.encodeStruct([
        this.uin,
        user_id, type?1:0, 1, 0, type?15:0, comment, 0, 1, null, 3004,
        11, null, null, group_id?pb.encode("AddFrdFromGrp", {groupCode: group_id}):null, 0, null, null, 0
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "AddFriendReq",
    };
    const body = jce.encodeWrapper({AF}, extra);
    const blob = await this.sendUNI("friendlist.addFriend", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[6]};
}

async function delFriend(user_id, block) {
    const DF = jce.encodeStruct([
        this.uin,
        user_id, 2, block?1:0
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "DelFriendReq",
    };
    const body = jce.encodeWrapper({DF}, extra);
    const blob = await this.sendUNI("friendlist.delFriend", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[2]};
}

async function setProfile(k, v) {
    this.nextSeq();
    v = Buffer.from(v);
    const buf = Buffer.alloc(11 + v.length);
    buf.writeUInt32BE(this.uin), buf.writeUInt8(0, 4);
    buf.writeInt32BE(k, 5), buf.writeUInt16BE(v.length, 9);
    buf.fill(v, 11);
    const body = pb.encode("OIDBSSOPkg", {
        command:     1279,
        serviceType: 9,
        result:      0,
        bodybuffer:  buf
    });
    const blob = await this.sendUNI("OidbSvc.0x4ff_9", body);
    const o = pb.decode("OIDBSSOPkg", blob);
    if (o.result === 34)
        o.result = 0;
    return o;
}

async function setSign(sign) {
    sign = Buffer.from(String(sign)).slice(0, 254);
    this.nextSeq();
    const body = pb.encode("SignAuthReqPkg", {
        prefix: 2,
        timestamp: Date.now(),
        head: {
            command: 109,
            unknown: {
                num: 825110830
            },
            ver: "8.2.7"
        },
        body: {
            uin: this.uin,
            prefix: 0,
            length: 27 + sign.length,
            content: Buffer.concat([
                Buffer.from([0x3, sign.length+1, 0x20]), sign, 
                Buffer.from([0x91,0x04,0x00,0x00,0x00,0x00,0x92,0x04,0x00,0x00,0x00,0x00,0xA2,0x04,0x00,0x00,0x00,0x00,0xA3,0x04,0x00,0x00,0x00,0x00])
            ]),
            suffix: 0
        },
        suffix: 1
    });
    const blob = await this.sendUNI("Signature.auth", body);
    return pb.decode("SignAuthRspPkg", blob);
}

async function setStatus(status) {
    let sub = 0;
    if (status > 1000) {
        sub = status, status = 11;
    }
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        7, 0, "", status, 0, 0, 0, 0, 0, 248,
        this.device_info.version.sdk, 0, "", 0, null, this.device_info.guid, 2052, 0, this.device_info.model, this.device_info.model,
        this.device_info.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
        "", "", null, 1, null, 0, null, sub, 0
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const blob = await this.sendUNI("StatSvc.SetStatusFromClient", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[9]};
}

//group----------------------------------------------------------------------------------------------------

async function setAdmin(group_id, user_id, enable) {
    this.nextSeq();
    const buf = Buffer.alloc(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable?1:0, 8);
    const body = pb.encode("OIDBSSOPkg", {
        command: 1372,
        serviceType: 1,
        bodybuffer: buf,
    });
    const blob = await this.sendUNI("OidbSvc.0x55c_1", body);
    return pb.decode("OIDBSSOPkg", blob);
}
async function setTitle(group_id, user_id, title, duration) {
    this.nextSeq();
    title = Buffer.from(title.toString());
    duration = parseInt(duration);
    const body = pb.encode("OIDBSSOPkg", {
        command: 2300,
        serviceType: 2,
        bodybuffer: pb.encode("D8FCReqBody", {
            groupCode: group_id,
            memLevelInfo: [{
                uin: user_id,
                uinName: title,
                specialTitle: title,
                specialTitleExpireTime: duration&0xffffffff
            }]
        }),
    });
    const blob = await this.sendUNI("OidbSvc.0x8fc_2", body);
    return pb.decode("OIDBSSOPkg", blob);
}

async function setGroup(group_id, k, v) {
    this.nextSeq();
    const qwerty = {
        groupCode: parseInt(group_id),
		stGroupInfo: {},
    };
    qwerty.stGroupInfo[k] = v;
    const body = pb.encode("OIDBSSOPkg", {
        command:    2202,
        bodybuffer: pb.encode("D89AReqBody", qwerty),
    });
    const blob = await this.sendUNI("OidbSvc.0x89a_0", body);
    return commonUNI(this, CMD.GROUP_SETTING, body);
}

async function setCard(group_id, user_id, card) {
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, card?card.toString():"", 0, "", "", ""
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

async function kickMember(group_id, user_id, block) {
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:    2208,
        bodybuffer: pb.encode("D8A0ReqBody", {
            optUint64GroupCode: group_id,
            msgKickList:        [{
                optUint32Operate:   5,
                optUint64MemberUin: user_id,
                optUint32Flag:      block?1:0,
            }],
            kickMsg:            BUF0
        })
    });
    const blob = await this.sendUNI("OidbSvc.0x8a0_0", body);
    const o = pb.decode("D8A0RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
    return {result: o.msgKickResult[0].optUint32Result};
}

async function banMember(group_id, user_id, duration) {
    this.nextSeq();
    const buf = Buffer.alloc(15);
    buf.writeUInt32BE(group_id), buf.writeUInt8(32, 4), buf.writeUInt16BE(1, 5);
    buf.writeUInt32BE(user_id, 7), buf.writeUInt32BE(duration, 11);
    const body = pb.encode("OIDBSSOPkg", {
        command:     1392,
        serviceType: 8,
        bodybuffer:  buf
    });
    await this.sendUNI("OidbSvc.0x570_8", body);
}

async function leaveGroup(group_id, dismiss) {
    let command, buf = Buffer.alloc(8);
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
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     3795,
        serviceType: 1,
        bodybuffer:  pb.encode("DED3ReqBody", {
            toUin: user_id,
            groupCode: group_id
        })
    });
    await this.sendUNI("OidbSvc.0xed3", body);
}

async function addGroup(group_id) {
    const buf = Buffer.alloc(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(this.uin, 4), buf.writeUInt8(0, 8);
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
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     1880,
        serviceType: 1,
        result:      0,
        bodybuffer:  pb.encode("D758ReqBody", {
            groupCode: group_id,
            toUin: {
                uin: user_id
            }
        }),
        clientVersion: "android 8.2.7"
    });
    const blob = await this.sendUNI("OidbSvc.oidb_0x758", body);
    const result = pb.decode("OIDBSSOPkg", blob).bodybuffer.length > 6 ? 0 : 1;
    return {result};
}

module.exports = {
    setStatus, setProfile, setSign, sendLike, addFriend, delFriend,
    setAdmin, setTitle, setCard, kickMember, banMember, leaveGroup, pokeMember, setGroup, addGroup, inviteFriend
};
