//list&info----------------------------------------------------------------------------------------------------

function buildFriendListRequestPacket(start, c) {
    const d50 = pb.encode("D50ReqBody", {
        appid:                   10002,
        reqMusicSwitch:          1,
        reqMutualmarkAlienation: 1,
        reqKsingSwitch:          1,
        reqMutualmarkLbsshare:   1,
        reqC8C77A:               1,
    });
    const FL = jce.encodeStruct([
        3,
        1, c.uin, start, 150, 0, 0, 0, 0, 0, 1,
        31, null, 0, 0, 0, d50, BUF0, [13580, 13581, 13582]
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetFriendListReq",
    };
    const body = jce.encodeWrapper({FL}, extra);
    return commonUNI(c, CMD.FRIEND_LIST, body);
}

function buildGroupListRequestPacket(c) {
    const GetTroopListReqV2Simplify = jce.encodeStruct([
        c.uin, 0, null, [], 1, 8, 0, 1, 1
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopListReqV2Simplify",
    };
    const body = jce.encodeWrapper({GetTroopListReqV2Simplify}, extra);
    return commonUNI(c, CMD.GROUP_LIST, body);
}

function buildGroupMemberListRequestPacket(group_id, next_uin, c) {
    const GTML = jce.encodeStruct([
        c.uin, group_id, next_uin, common.code2uin(group_id), 2, 0, 0, 0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopMemberListReq",
    };
    const body = jce.encodeWrapper({GTML}, extra);
    return commonUNI(c, CMD.MEMBER_LIST, body);
}

function buildGroupInfoRequestPacket(group_id, c) {
    const list = [{
        groupCode: group_id,
        groupInfo: {
            groupOwner: 0,
            groupCreateTime: 0,
            groupMemberMaxNum: 0,
            groupMemberNum: 0,
            groupName: "",
            groupAdminMaxNum: 0,
            groupGrade: 0,
            activeMemberNum: 0,
            shutupTimestamp: 0,
            shutupTimestampMe: 0,
            cmduinJoint32ime: 0,
            cmduinLastMsgTime: 0,
            longGroupName: "",
        },
    }];
    c.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command: 2189,
        serviceType: 0,
        bodybuffer: pb.encode("D88DReqBody", {
            appid: 200000020,
            groupList: list,
        })
    });
    return commonUNI(c, CMD.GROUP_INFO, body);
}

function buildGroupMemberInfoRequestPacket(group_id, user_id, c) {
    c.nextSeq();
    const body = pb.encode("GetCardReqPkg", {
        groupCode: group_id,
        uin: user_id,
        flag1: 1,
        flag2: 1,
        flag3: 1,
    });
    return commonUNI(c, CMD.GROUP_MEMBER, body);
}

function buildStrangerInfoRequestPacket(user_id, c) {
    const arr = [
        null,
        0, "", [user_id], 1,1,0,0,0,1,0,1
    ];
    arr[101] = 1;
    const req = jce.encodeStruct(arr);
    const extra = {
        req_id:  c.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GetSimpleInfo",
    };
    const body = jce.encodeWrapper({req}, extra);
    return commonUNI(c, CMD.STRANGER_INFO, body);
}

//request----------------------------------------------------------------------------------------------------

function buildNewFriendRequestPacket(c) {
    c.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    1,
        version:   1000,
        checktype: 2,
        flag: {
            frdMsgDiscuss2ManyChat:       1,
            frdMsgGetBusiCard:            1,
            frdMsgNeedWaitingMsg:         1,
            frdMsgUint32NeedAllUnreadMsg: 1,
            grpMsgMaskInviteAutoJoin:     1,
        },
        friendMsgTypeFlag: 1,
    });
    return commonUNI(c, CMD.FRIEND_REQ, body);
}
function buildNewGroupRequestPacket(c) {
    c.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    1,
        version:   100,
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
        friendMsgTypeFlag: 1,
    });
    return commonUNI(c, CMD.GROUP_REQ, body);
}
function buildNewFriendActionRequestPacket(flag, approve = true, block = false, c) {
    const {user_id, low, high} = common.parseFriendRequestFlag(flag);
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
    return commonUNI(c, CMD.FRIEND_REQ_ACT, body);
}
function buildNewGroupActionRequestPacket(flag, approve = true, reason = "", block = false, c) {
    const {user_id, group_id, low, high, invite} = common.parseGroupRequestFlag(flag);
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
            msg:        reason,
            sig:        BUF0,
        },
    });
    return commonUNI(c, CMD.GROUP_REQ_ACT, body);
}

//individual----------------------------------------------------------------------------------------------------

function buildAddGroupRequestPacket(group_id, c) {
    const buf = Buffer.alloc(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(c.uin, 4), buf.writeUInt8(0, 8);
    const GroupMngReq = jce.encodeStruct([
        1,
        c.uin, buf, 0, "", 0, 3, 30002, 0, 0, 0,
        null, "", null, "", "", 0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GroupMngReq",
    };
    const body = jce.encodeWrapper({GroupMngReq}, extra);
    return commonUNI(c, CMD.GROUP_MNG, body);
}

function buildSendLikeRequestPacket(user_id, times, c) {
    c.nextSeq();
    const ReqFavorite = jce.encodeStruct([
        jce.encodeNested([
            c.uin, 1, c.seq_id, 1, 0, Buffer.from("0C180001060131160131", "hex")
        ]),
        user_id, 0, 1, times
    ]);
    const extra = {
        req_id:  c.seq_id,
        service: "VisitorSvc",
        method:  "ReqFavorite",
    };
    const body = jce.encodeWrapper({ReqFavorite}, extra);
    return commonUNI(c, CMD.SEND_LIKE, body, BUF0);
}
function buildAddSettingRequestPacket(user_id, c) {
    const FS = jce.encodeStruct([
        c.uin,
        user_id, 3004, 0, null, 1
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetUserAddFriendSettingReq",
    };
    const body = jce.encodeWrapper({FS}, extra);
    return commonUNI(c, CMD.ADD_SETTING, body, BUF0);
}
function buildAddFriendRequestPacket(type, group_id, user_id, comment, c) {
    const AF = jce.encodeStruct([
        c.uin,
        user_id, type?1:0, 1, 0, type?15:0, comment, 0, 1, null, 3004,
        11, null, null, group_id?pb.encode("AddFrdFromGrp", {groupCode: group_id}):null, 0, null, null, 0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "AddFriendReq",
    };
    const body = jce.encodeWrapper({AF}, extra);
    return commonUNI(c, CMD.ADD_FRIEND, body, BUF0);
}
function buildDelFriendRequestPacket(user_id, block, c) {
    const DF = jce.encodeStruct([
        c.uin,
        user_id, 2, block?1:0
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "DelFriendReq",
    };
    const body = jce.encodeWrapper({DF}, extra);
    return commonUNI(c, CMD.DEL_FRIEND, body, BUF0);
}
function buildInviteRequestPacket(group_id, user_id, c) {
    c.nextSeq();
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
    return commonUNI(c, CMD.GROUP_INVITE, body);
}

function buildSetProfileRequestPacket(k, v, c) {
    c.nextSeq();
    v = Buffer.from(v);
    const buf = Buffer.alloc(11 + v.length);
    buf.writeUInt32BE(c.uin), buf.writeUInt8(0, 4);
    buf.writeInt32BE(k, 5), buf.writeUInt16BE(v.length, 9);
    buf.fill(v, 11);
    const body = pb.encode("OIDBSSOPkg", {
        command:     1279,
        serviceType: 9,
        result:      0,
        bodybuffer:  buf
    });
    return commonUNI(c, CMD.SET_PROFILE, body);
}

function buildSetSignRequestPacket(sign, c) {
    sign = Buffer.from(sign).slice(0, 254);
    c.nextSeq();
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
            uin: c.uin,
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
    return commonUNI(c, CMD.SET_SIGN, body);
}

//list&info rsp----------------------------------------------------------------------------------------------------

const friend_sex_map = {
    "0":"unknown", "1":"male", "2":"female"
};
const group_sex_map = {
    "-1":"unknown", "0":"male", "1":"female"
};
const group_role_map = {
    "1":"member", "2":"admin", "3":"owner"
};

/**
 * @returns {Number} 好友总数
 */
function decodeFriendListResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    for (let v of parent[7]) {
        v = jce.decode(v);
        c.fl.set(v[0], {
            user_id:    v[0],
            nickname:   v[14],
            sex:        friend_sex_map[v[31]],
            age:        0,
            area:       "unknown",
            remark:     v[3],
        })
    }
    return parent[5];
}

function decodeGroupListResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    for (let v of parent[5]) {
        v = jce.decode(v);
        c.gl.set(v[1], {
            group_id:           v[1],
            group_name:         v[4],
            member_count:       v[19],
            max_member_count:   v[29],
            owner_id:           v[23],
            last_join_time:     v[27],
            last_sent_time:     0,
            shutup_time_whole:  v[9] & 0xffffffff,
            shutup_time_me:     v[10],
            create_time:        0,
            grade:              0,
            max_admin_count:    0,
            active_member_count:0,
            update_time:        0,
        });
    }
}
function decodeGroupInfoResponse(blob, c) {
    let o =  pb.decode("D88DRspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer).groupList[0];
    const group_id = toInt(o.groupCode);
    o = o.groupInfo;
    if (!o) {
        c.gl.delete(group_id);
        c.gml.delete(group_id);
        return null;
    }
    const ginfo = {
        group_id:           group_id,
        group_name:         o.longGroupName ? o.longGroupName : o.groupName,
        member_count:       o.groupMemberNum,
        max_member_count:   o.groupMemberMaxNum,
        owner_id:           toInt(o.groupOwner),
        last_join_time:     o.cmduinJoint32ime,
        last_sent_time:     o.cmduinLastMsgTime,
        shutup_time_whole:  o.shutupTimestamp & 0xffffffff,
        shutup_time_me:     o.shutupTimestampMe,
        create_time:        o.groupCreateTime,
        grade:              o.groupGrade,
        max_admin_count:    o.groupAdminMaxNum,
        active_member_count:o.activeMemberNum,
        update_time:        common.timestamp(),
    };
    c.gl.set(group_id, ginfo);
    return ginfo;
}

/**
 * @returns {JSON}
 *  @field {Map} map
 *  @field {Number} next 下一个uin
 */
function decodeGroupMemberListResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const group_id = parent[1];
    const map = new Map(), next = parent[4];
    for (let v of parent[3]) {
        v = jce.decode(v);
        map.set(v[0], {
            group_id:           group_id,
            user_id:            v[0],
            nickname:           v[4],
            card:               v[8],
            sex:                group_sex_map[v[3]],
            age:                v[2],
            area:               "unknown",
            join_time:          v[15],
            last_sent_time:     v[16],
            level:              v[14],
            role:               v[18] ? "admin" : "member",
            unfriendly:         false,
            title:              v[23],
            title_expire_time:  v[24]&0xffffffff,
            card_changeable:    true,
            update_time:        0,
        });
    }
    try {
        const owner = c.gl.get(group_id).owner_id;
        map.get(owner).role = "owner";
    } catch (e) {}
    return {map, next};
}
function decodeGroupMemberInfoResponse(blob, c) {
    let o = pb.decode("GetCardRspPkg", blob);
    const group_id = toInt(o.groupCode);
    o = o.body;
    if (!o.role) return null;
    const uin = toInt(o.uin);
    if (o.sex === undefined) o.sex = -1;
    return {
        group_id:           group_id,
        user_id:            uin,
        nickname:           o.nickname,
        card:               o.card,
        sex:                Reflect.has(o, "sex")?group_sex_map[o.sex]:"unknown",
        age:                o.age,
        area:               Reflect.has(o, "area")?o.area:"unknown",
        join_time:          toInt(o.joinTime),
        last_sent_time:     toInt(o.lastSentTime),
        level:              o.level,
        rank:               o.rank,
        role:               group_role_map[o.role],
        unfriendly:         false,
        title:              Reflect.has(o, "title")?o.title:"",
        title_expire_time:  Reflect.has(o, "titleExpireTime")?o.titleExpireTime:-1,
        card_changeable:    true,
        update_time:        common.timestamp(),
    };
}

function decodeStrangerInfoResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    for (let v of nested) {
        v = jce.decode(v);
        const area = (v[13]+" "+v[14]+" "+v[15]).trim();
        const user = {
            user_id: v[1],
            nickname: v[5],
            sex: group_sex_map[v[3]],
            age: v[4],
            area: area?area:"unknown",
        };
        let o = c.fl.get(v[1]);
        if (!o)
            o = c.sl.get(v[1]);
        if (o) {
            o.area = user.area;
            if (user.sex !== "unknown")
                o.sex = user.sex;
            if (user.age)
                o.age = user.age;
        }
        return user;
    }
    return null;
}

//request rsp----------------------------------------------------------------------------------------------------

function decodeNewFriendResponse(blob, c) {
    const o = pb.decode("RspSystemMsgNew", blob);
    // common.log(o)
    const v = o.friendmsgs[0];
    const time = toInt(v.msgTime);
    const user_id = toInt(v.reqUin);
    const flag = common.genFriendRequestFlag(user_id, v.msgSeq);
    c.logger.info(`收到 ${user_id}(${v.msg.reqUinNick}) 的加好友请求 (flag: ${flag})`);
    event.emit(c, "request.friend.add", {
        user_id,
        nickname:   v.msg.reqUinNick,
        source:     v.msg.msgSource,
        comment:    v.msg.msgAdditional,
        sex:        v.msg.reqUinGender===0?"male":(v.msg.reqUinGender===1?"famale":"unknown"),
        age:        v.msg.reqUinAge,
        flag, time
    });
}
function decodeNewGroupResponse(blob, c) {
    const o = pb.decode("RspSystemMsgNew", blob);
    // common.log(o)
    const v = o.groupmsgs[0];
    if (v.msg.subType !== 1) return;
    const time = toInt(v.msgTime);
    const group_id = toInt(v.msg.groupCode); 
    if (v.msg.groupMsgType === 1) {
        const user_id = toInt(v.reqUin);
        const flag = common.genGroupRequestFlag(user_id, group_id, v.msgSeq);
        c.logger.info(`用户 ${user_id}(${v.msg.reqUinNick}) 请求加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
        event.emit(c, "request.group.add", {
            group_id, user_id,
            group_name: v.msg.groupName,
            nickname:   v.msg.reqUinNick,
            comment:    v.msg.msgAdditional,
            flag, time
        });
    } else if (v.msg.groupMsgType === 2) {
        const user_id = toInt(v.msg.actionUin);
        const flag = common.genGroupRequestFlag(user_id, group_id, v.msgSeq, 1);
        c.logger.info(`用户 ${user_id}(${v.msg.actionUinNick}) 邀请你加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
        event.emit(c, "request.group.invite", {
            group_id, user_id,
            group_name: v.msg.groupName,
            nickname:   v.msg.actionUinNick,
            role:       v.msg.groupInviterRole === 1 ? "member" : "admin",
            flag, time
        });
    }
}

function decodeSystemActionResponse(blob, c) {
    const o = pb.decode("RspSystemMsgAction", blob);
    return o.head.result === 0;
}

//individual rsp----------------------------------------------------------------------------------------------------

function decodeSendLikeResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return jce.decode(parent[0])[3] === 0;
}
function decodeAddSettingResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    if (parent[4]) return false;
    return parent[2];
}
function decodeAddFriendResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[6] === 0;
}
function decodeDelFriendResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[2] === 0;
}
function decodeInviteResponse(blob, c) {
    return pb.decode("OIDBSSOPkg", blob).bodybuffer.length > 6;
}

function decodeSetProfileResponse(blob, c) {
    const o = pb.decode("OIDBSSOPkg", blob);
    return o.result === 0 || o.result === 34;
}

function decodeSetSignResponse(blob, c) {
    const o = pb.decode("SignAuthRspPkg", blob);
    return o.result === 0;
}

module.exports = {
    setProfile, setSign, sendLike,
    addGroup, addFriend, delFriend, inviteJoinGroup,
    getNewFriend, getNewGroup, friendAction, groupAction,
}
