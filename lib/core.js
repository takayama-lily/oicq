"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const ecdh = require("./wtlogin/ecdh");
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const chat = require("./message/chat");
const push = require("./online-push");
const BUF0 = Buffer.alloc(0);
const toInt = common.toInt;

function onPushReq(blob, seq) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);

    this.nextSeq();
    const PushResp = jce.encodeStruct([
        null, parent[1], parent[3], parent[1] === 3 ? parent[2] : null
    ]);
    const extra = {
        req_id:  seq,
        service: "QQService.ConfigPushSvc.MainServant",
        method:  "PushResp",
    };
    const body = jce.encodeWrapper({PushResp}, extra);
    this.writeUNI("ConfigPushSvc.PushResp", body);

    let ip, port;
    if (parent[1] === 1) {
        let server = jce.decode(parent[2])[1][0];
        server = jce.decode(server);
        ip = server[0], port = server[1];
    }
    //更换服务器理论上可以获得更好的性能和连接稳定性，一般来说无视这个包也没什么问题
    //据说前段时间服务器不稳定导致的频繁掉线和这个有关
    common.emit(this, "internal.change-server", {ip, port});
}

function onPushNotify(blob) {
    if (!this.sync_finished) return;
    const nested = jce.decodeWrapper(blob.slice(15));
    const parent = jce.decode(nested);
    switch (parent[5]) {
        case 33:
        case 141:
        case 166:
        case 167:
            return getMsg.call(this);
        case 84:
        case 87:
            return getNewGroup.call(this);
        case 187:
            return getNewFriend.call(this);
    }
}

/**
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
async function getMsg(sync_flag = 0) {
    this.nextSeq();
    if (!this.sync_cookie) {
        const time = common.timestamp();
        this.sync_cookie = pb.encode("SyncCookie", {
            time1:  time,
            time:   time,
            ran1:   crypto.randomBytes(4).readUInt32BE(),
            ran2:   crypto.randomBytes(4).readUInt32BE(),
            ran3:   crypto.randomBytes(4).readUInt32BE(),
            const1: this.const1,
            const2: this.const2,
            const3: 0x22,
            lastSyncTime: time,
            const4: 0,
        });
    }
    let body = pb.encode("GetMessageRequest", {
        syncFlag:           sync_flag,
        syncCookie:         this.sync_cookie,
        rambleFlag:         0,
        latestRambleNumber: 20,
        otherRambleNumber:  3,
        onlineSyncFlag:     1,
        contextFlag:        1,
        msgReqType:         1,
        // pubaccountCookie:   BUF0,
        // msgCtrlBuf:         BUF0,
        serverBuf:          BUF0,
    });
    try {
        const blob = await this.sendUNI("MessageSvc.PbGetMsg", body);
        const o = pb.decode("GetMessageResponse", blob);
        if (o.syncCookie)
            this.sync_cookie = o.syncCookie;
        if (o.result > 0 || !o.uinPairMsgs)
            return;
        // common.log(o);
        const items = [];
        for (let v of o.uinPairMsgs) {
            if (!v.messages) continue;
            for (let msg of v.messages) {
                const head = msg.head, body = msg.body;
                const type = head.msgType;
                head.msgType = 187;
                items.push(head);
                if (!this.sync_finished)
                    continue;
                let user_id = toInt(head.fromUin);
                if (user_id === this.uin && this.ignore_self)
                    continue;
                // if (v.lastReadTime === -1 || v.lastReadTime > head.msgTime)
                //     continue;
                let update_flag = false;
                if (!this.seq_cache.has(user_id)) {
                    this.seq_cache.set(user_id, head.msgSeq);
                } else {
                    const seq = this.seq_cache.get(user_id);
                    if (seq - head.msgSeq >= 0 && seq - head.msgSeq < 1000)
                        continue;
                    else {
                        update_flag = Math.abs(head.msgSeq - seq) > 1 || head.msgSeq % 10 === 0;
                        this.seq_cache.set(user_id, head.msgSeq);
                    }
                }
                if (type === 33) {
                    (async()=>{
                        const group_id = common.uin2code(user_id);
                        user_id = toInt(head.authUin);
                        try {
                            const ginfo = (await this.getGroupInfo(group_id)).data;
                            if (user_id === this.uin) {
                                this.logger.info(`更新了群列表，新增了群：${group_id}`);
                                this.getGroupMemberList(group_id);
                            } else {
                                ginfo.member_count++;
                                ginfo.last_join_time = common.timestamp();
                                await this.getGroupMemberInfo(group_id, user_id);
                            }
                        } catch (e) {}
                        common.emit(this, "notice.group.increase", {
                            group_id, user_id,
                            nickname: head.authNick
                        });
                    })();
                }
                if ([141, 166, 167].includes(type))
                    chat.onPrivateMsg.call(this, type, user_id, head, body, update_flag);
            }
        }

        if (items.length) {
            this.nextSeq();
            this.writeUNI("MessageSvc.PbDeleteMsg", pb.encode("DeleteMessageRequest", {items}));
        }
        if (o.syncFlag !== 2)
            getMsg.call(this, o.syncFlag);
    } catch (e) {
        this.logger.debug("getMsg发生错误。");
        this.logger.debug(e);
    }
}

async function getNewFriend() {
    this.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    20,
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
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Friend", body);
        const o = pb.decode("RspSystemMsgNew", blob);
        // common.log(o)
        const v = o.friendmsgs[0];
        const time = toInt(v.msgTime);
        const user_id = toInt(v.reqUin);
        const flag = common.genFriendRequestFlag(user_id, v.msgSeq);
        this.logger.info(`收到 ${user_id}(${v.msg.reqUinNick}) 的加好友请求 (flag: ${flag})`);
        common.emit(this, "request.friend.add", {
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

async function getNewGroup() {
    this.nextSeq();
    const body = pb.encode("ReqSystemMsgNew", {
        msgNum:    20,
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
        friendMsgTypeFlag: 1,
    });
    try {
        const blob = await this.sendUNI("ProfileService.Pb.ReqSystemMsgNew.Group", body);
        const o = pb.decode("RspSystemMsgNew", blob);
        // common.log(o)
        const v = o.groupmsgs[0];
        if (v.msg.subType !== 1) return;
        const time = toInt(v.msgTime);
        const group_id = toInt(v.msg.groupCode); 
        if (v.msg.groupMsgType === 1) {
            const user_id = toInt(v.reqUin);
            const flag = common.genGroupRequestFlag(user_id, group_id, v.msgSeq);
            this.logger.info(`用户 ${user_id}(${v.msg.reqUinNick}) 请求加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
            common.emit(this, "request.group.add", {
                group_id, user_id,
                group_name: v.msg.groupName,
                nickname:   v.msg.reqUinNick,
                comment:    v.msg.msgAdditional,
                flag, time
            });
        } else if (v.msg.groupMsgType === 2) {
            const user_id = toInt(v.msg.actionUin);
            const flag = common.genGroupRequestFlag(user_id, group_id, v.msgSeq, 1);
            this.logger.info(`用户 ${user_id}(${v.msg.actionUinNick}) 邀请你加入群 ${group_id}(${v.msg.groupName}) (flag: ${flag})`);
            common.emit(this, "request.group.invite", {
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

//list&info----------------------------------------------------------------------------------------------------

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
 * @param {Number} start 
 * @returns {Number} 好友总数
 */
async function initFL(start) {
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
        1, this.uin, start, 150, 0, 0, 0, 0, 0, 1,
        31, null, 0, 0, 0, d50, BUF0, [13580, 13581, 13582]
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetFriendListReq",
    };
    const body = jce.encodeWrapper({FL}, extra);
    try {
        const blob = await this.sendUNI("friendlist.getFriendGroupList", body);
        const nested = jce.decodeWrapper(blob);
        const parent = jce.decode(nested);
        for (let v of parent[7]) {
            v = jce.decode(v);
            this.fl.set(v[0], {
                user_id:    v[0],
                nickname:   v[14],
                sex:        friend_sex_map[v[31]],
                age:        0,
                area:       "unknown",
                remark:     v[3],
            })
        }
        return parent[5];
    } catch (e) {
        this.logger.warn("初始化好友列表出现异常，未加载完成。");
        return 0;
    }
}

async function initGL() {
    const GetTroopListReqV2Simplify = jce.encodeStruct([
        this.uin, 0, null, [], 1, 8, 0, 1, 1
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopListReqV2Simplify",
    };
    const body = jce.encodeWrapper({GetTroopListReqV2Simplify}, extra);
    try {
        const blob = await this.sendUNI("friendlist.GetTroopListReqV2", body);
        const nested = jce.decodeWrapper(blob);
        const parent = jce.decode(nested);
        for (let v of parent[5]) {
            v = jce.decode(v);
            this.gl.set(v[1], {
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
    } catch (e) {
        this.logger.warn("初始化群列表出现异常，未加载完成。");
    }
}

/**
 * @returns {JSON}
 *  @field {Map} map
 *  @field {Number} next 下一个uin
 */
async function getGML(group_id, next_uin) {
    const GTML = jce.encodeStruct([
        this.uin, group_id, next_uin, common.code2uin(group_id), 2, 0, 0, 0
    ]);
    const extra = {
        req_id:  this.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "GetTroopMemberListReq",
    };
    const body = jce.encodeWrapper({GTML}, extra);
    const blob = await this.sendUNI("friendlist.GetTroopMemberListReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
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
            rank:               "",
            role:               v[18] ? "admin" : "member",
            unfriendly:         false,
            title:              v[23],
            title_expire_time:  v[24]&0xffffffff,
            card_changeable:    true,
            update_time:        0,
        });
    }
    try {
        const owner = this.gl.get(group_id).owner_id;
        map.get(owner).role = "owner";
    } catch (e) {}
    return {map, next};
}

async function getGI(group_id, no_cache = false) {
    var [group_id] = common.uinAutoCheck(group_id);

    let ginfo = this.gl.get(group_id);
    if (!no_cache && ginfo && common.timestamp() - ginfo.update_time <= 3600)
        return {result: 0, data: ginfo};

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
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command: 2189,
        serviceType: 0,
        bodybuffer: pb.encode("D88DReqBody", {
            appid: 200000020,
            groupList: list,
        })
    });
    const blob = await this.sendUNI("OidbSvc.0x88d_0", body);
    const o =  pb.decode("D88DRspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer).groupList[0].groupInfo;
    if (!o) {
        this.gl.delete(group_id);
        this.gml.delete(group_id);
        return {result: 1};
    }
    ginfo = {
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
    this.gl.set(group_id, ginfo);
    return {result: 0, data: ginfo};
}

async function getGMI(group_id, user_id, no_cache = false) {
    var [group_id, user_id] = common.uinAutoCheck(group_id, user_id);
    if (!this.gml.has(group_id))
        this.getGroupMemberList(group_id);
    let minfo;
    try {
        minfo = this.gml.get(group_id).get(user_id);
    } catch (e) {}
    if (!no_cache && minfo && common.timestamp() - minfo.update_time <= 3600)
        return {result: 0, data: minfo};

    this.nextSeq();
    const body = pb.encode("GetCardReqPkg", {
        groupCode: group_id,
        uin: user_id,
        flag1: 1,
        flag2: 1,
        flag3: 1,
    });
    const blob = await this.sendUNI("group_member_card.get_group_member_card_info", body);
    const o = pb.decode("GetCardRspPkg", blob).body;
    if (!o.role) return {result: 1};
    if (o.sex === undefined) o.sex = -1;
    minfo = {
        group_id:           group_id,
        user_id:            user_id,
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
    try {
        this.gml.get(group_id).set(user_id, minfo);
    } catch (e) {}
    return {result: 0, data: minfo};
}

async function getSI(user_id, no_cache = false) {
    var [user_id] = common.uinAutoCheck(user_id);
    let user = this.sl.get(user_id);
    if (!no_cache && user)
        return {result: 0, data: user};

    const arr = [
        null,
        0, "", [user_id], 1,1,0,0,0,1,0,1
    ];
    arr[101] = 1;
    const req = jce.encodeStruct(arr);
    const extra = {
        req_id:  this.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GetSimpleInfo",
    };
    const body = jce.encodeWrapper({req}, extra);
    const blob = await this.sendUNI("ProfileService.GetSimpleInfo", body);
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
        let o = this.fl.get(v[1]);
        if (!o)
            o = this.sl.get(v[1]);
        if (o) {
            o.area = user.area;
            if (user.sex !== "unknown")
                o.sex = user.sex;
            if (user.age)
                o.age = user.age;
        }
        return {result: 0, data: user};
    }
    return {result: 1};
}

//offline----------------------------------------------------------------------------------------------------

function onForceOffline(blob) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    common.emit(this, "internal.kickoff", {
        type: "PushForceOffline",
        info: `[${parent[1]}]${parent[2]}`,
    });
}
function onMSFOffline(blob) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    if (parent[3].includes("如非本人操作，则密码可能已泄露"))
        return;
    common.emit(this, "internal.kickoff", {
        type: "ReqMSFOffline",
        info: `[${parent[4]}]${parent[3]}`,
    });
}

//----------------------------------------------------------------------------------------------

function parseSSO(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    stream.read(0);
    if (stream.read(4).readInt32BE() - 4 > stream.readableLength) {
        throw new Error("dropped");
    }
    const seq = stream.read(4).readInt32BE();
    const retcode = stream.read(4).readInt32BE();
    if (retcode) {
        throw new Error("return code unsuccessful: " + retcode);
    }
    stream.read(stream.read(4).readInt32BE() - 4);
    const cmd = stream.read(stream.read(4).readInt32BE() - 4).toString();
    const session_id = stream.read(stream.read(4).readInt32BE() - 4); //?
    if (cmd === "Heartbeat.Alive") {
        return {
            seq, cmd, payload: BUF0
        };
    }

    const compressed = stream.read(4).readInt32BE();
    var payload;
    if (compressed === 0) {
        stream.read(4);
        payload = stream.read();
    } else if (compressed === 1) {
        stream.read(4);
        payload = zlib.unzipSync(stream.read());
    } else if (compressed === 8) {
        payload = stream.read();
    } else
        throw new Error("unknown compressed flag: " + compressed)
    return {
        seq, cmd, payload
    };
}
function parseOICQ(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    if (stream.read(1).readUInt8() !== 2) {
        throw new Error("unknown flag");
    }
    stream.read(12);
    const encrypt_type = stream.read(2).readUInt16BE();
    stream.read(1)
    if (encrypt_type === 0) {
        const encrypted = stream.read(stream.readableLength - 1);
        let decrypted = tea.decrypt(encrypted, ecdh.share_key);
        return decrypted;
    } else if (encrypt_type === 4) {
        throw new Error("todo");
    } else
        throw new Error("unknown encryption method: " + encrypt_type);
}

const events = {
    "OnlinePush.PbPushGroupMsg": chat.onGroupMsg,
    "OnlinePush.PbPushDisMsg": chat.onDiscussMsg,
    "OnlinePush.ReqPush": push.onOnlinePush,
    "OnlinePush.PbPushTransMsg": push.onOnlinePushTrans,
    "ConfigPushSvc.PushReq": onPushReq,
    "MessageSvc.PushNotify": onPushNotify,
    "MessageSvc.PushForceOffline": onForceOffline, 
    "StatSvc.ReqMSFOffline": onMSFOffline,
};
// StatSvc.GetOnlineStatus
// PttStore.GroupPttDown
// ConfigPushSvc.PushDomain
// MessageSvc.RequestPushStatus
// MessageSvc.PushReaded
// StatSvc.SvcReqMSFLoginNotify
// MultiVideo.s2c
// QualityTest.PushList
// OnlinePush.SidTicketExpired
// OnlinePush.PbC2CMsgSync

/**
 * @param {Buffer} packet
 */
function parseIncomingPacket(packet) {
    const stream = Readable.from(packet, {objectMode:false});
    const flag1 = stream.read(4).readInt32BE();
    if (flag1 !== 0x0A && flag1 !== 0x0B)
        throw new Error("decrypt failed");
    const flag2 = stream.read(1).readUInt8();
    const flag3 = stream.read(1).readUInt8();
    if (flag3 !== 0)
        throw new Error("unknown flag");
    stream.read(stream.read(4).readInt32BE() - 4);
    let decrypted = stream.read();
    switch (flag2) {
        case 0:
            break;
        case 1:
            decrypted = tea.decrypt(decrypted, this.sig.d2key);
            break;
        case 2:
            decrypted = tea.decrypt(decrypted, Buffer.alloc(16));
            break;
        default:
            decrypted = Buffer.alloc(0)
            break;
    }
    if (!decrypted.length)
        throw new Error("decrypt failed");
 
    const sso = parseSSO(decrypted);
    this.logger.trace(`recv:${sso.cmd} seq:${sso.seq}`);

    if (flag2 === 2)
        sso.payload = parseOICQ(sso.payload);
    if (events[sso.cmd])
        events[sso.cmd].call(this, sso.payload, sso.seq);
    else if (this.handlers.has(sso.seq))
        this.handlers.get(sso.seq)(sso.payload);
}

module.exports = {
    parseIncomingPacket, getMsg,
    initFL, initGL, getGML, getGI, getGMI, getSI,
};
