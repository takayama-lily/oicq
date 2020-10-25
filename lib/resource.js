"use strict";
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const toInt = common.toInt;

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
 * 好友列表
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
        31, null, 0, 0, 0, d50, null, [13580, 13581, 13582]
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

/**
 * 群列表
 */
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
                shutup_time_whole:  v[9]?0xffffffff:0,
                shutup_time_me:     v[10]*1000>Date.now()?v[10]:0,
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
 * 群员列表
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
            shutup_time:        v[30]*1000>Date.now()?v[30]:0,
            update_time:        0,
        });
    }
    try {
        const owner = this.gl.get(group_id).owner_id;
        map.get(owner).role = "owner";
    } catch (e) {}
    return {map, next};
}

/**
 * 群信息
 */
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
    try {
        this.gl.get(group_id).update_time = common.timestamp();
    } catch (e) {}
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
        shutup_time_whole:  o.shutupTimestamp?0xffffffff:0,
        shutup_time_me:     o.shutupTimestampMe*1000>Date.now()?o.shutupTimestampMe:0,
        create_time:        o.groupCreateTime,
        grade:              o.groupGrade,
        max_admin_count:    o.groupAdminMaxNum,
        active_member_count:o.activeMemberNum,
        update_time:        common.timestamp(),
    };
    this.gl.set(group_id, ginfo);
    return {result: 0, data: ginfo};
}

/**
 * 群员信息
 */
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
    try {
        this.gml.get(group_id).get(user_id).update_time = common.timestamp();
    } catch (e) {}
    const blob = await this.sendUNI("group_member_card.get_group_member_card_info", body);
    const o = pb.decode("GetCardRspPkg", blob).body;
    if (!o.role) return {result: 1};
    if (o.sex === undefined) o.sex = -1;
    if (o.card && o.card.startsWith("\n"))
        o.card = o.card.split("\n").pop().substr(3);
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
        shutup_time:        0,
        update_time:        common.timestamp(),
    };
    try {
        try {
            minfo.shutup_time = this.gml.get(group_id).get(user_id).shutup_time;
        } catch (e) {}
        this.gml.get(group_id).set(user_id, minfo);
    } catch (e) {}
    return {result: 0, data: minfo};
}

/**
 * 陌生人信息(也用于更新好友信息中的一些字段)
 */
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

module.exports = {
    initFL, initGL, getGML, getGI, getGMI, getSI,
};
