/**
 * 好友列表
 * 群列表，群资料
 * 群员列表，群员资料
 * 相关api
 */
"use strict";
const common = require("./common");
const pb = require("./pb");
const jce = require("./jce");

const friend_sex_map = {
    "0": "unknown", "1": "male", "2": "female"
};
const group_sex_map = {
    "-1": "unknown", "0": "male", "1": "female"
};
const group_role_map = {
    "1": "member", "2": "admin", "3": "owner"
};
const d50 = pb.encode({
    1: 10002,
    91001: 1,
    101001: 1,
    151001: 1,
    181001: 1,
    251001: 1,
});

/**
 * @this {import("./ref").Client}
 * @param {number} start 
 * @param {number} limit 
 * @param {Map<number, import("./ref").FriendInfo>} tmp
 * @returns {number} 好友总数
 */
async function _initFL(start, limit, tmp) {
    const FL = jce.encodeStruct([
        3,
        1, this.uin, start, limit, 0, 0, 0, 0, 0, 1,
        31, null, 0, 0, 0, d50, null, [13580, 13581, 13582]
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "GetFriendListReq",
    };
    const body = jce.encodeWrapper({ FL }, extra);
    const blob = await this.sendUni("friendlist.getFriendGroupList", body);
    const nested = jce.decode(blob);
    for (let v of nested[7]) {
        let age = 0, area = "unknown";
        if (tmp.has(v[0])) {
            const f = tmp.get(v[0]);
            age = f.age;
            area = f.area;
        }
        this.fl.set(v[0], {
            user_id: v[0],
            nickname: v[14] || "",
            sex: friend_sex_map[v[31]] || "unknown",
            age, area,
            remark: v[3] || "",
        });
    }
    return nested[5];
}

/**
 * 加载好友列表
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function initFL() {
    this.sync_finished = false;
    const tmp = this.fl;
    this.fl = new Map;
    let start = 0, limit = 150;
    while (1) {
        try {
            const total = await _initFL.call(this, start, limit, tmp);
            start += limit;
            if (start > total) break;
        } catch (e) {
            this.logger.debug(e);
            this.logger.warn("加载好友列表出现异常，未加载完成。");
            return { result: -1 };
        }
    }
    return { result: 0 };
}

/**
 * 加载群列表
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function initGL() {
    this.sync_finished = false;
    const GetTroopListReqV2Simplify = jce.encodeStruct([
        this.uin, 0, null, [], 1, 8, 0, 1, 1
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "GetTroopListReqV2Simplify",
    };
    const body = jce.encodeWrapper({ GetTroopListReqV2Simplify }, extra);
    try {
        const blob = await this.sendUni("friendlist.GetTroopListReqV2", body);
        const nested = jce.decode(blob);
        const tmp = this.gl;
        if (this.gl.size < 999)
            this.gl = new Map;
        for (let v of nested[5]) {
            var last_sent_time = 0, create_time = 0, grade = 0, max_admin_count = 0, active_member_count = 0;
            if (tmp.has(v[1])) {
                const g = tmp.get(v[1]);
                var { last_sent_time, create_time, grade, max_admin_count, active_member_count } = g;
            }
            this.gl.set(v[1], {
                group_id: v[1],
                group_name: v[4] || "",
                member_count: v[19],
                max_member_count: v[29],
                owner_id: v[23],
                last_join_time: v[27],
                last_sent_time,
                shutup_time_whole: v[9] ? 0xffffffff : 0,
                shutup_time_me: v[10] * 1000 > Date.now() ? v[10] : 0,
                create_time, grade,
                max_admin_count, active_member_count,
                update_time: 0,
            });
        }
    } catch (e) {
        this.logger.debug(e);
        this.logger.warn("加载群列表出现异常，未加载完成。");
        return { result: -1 };
    }
    return { result: 0 };
}

/**
 * @this {import("./ref").Client}
 */
async function __getGML(group_id, next_uin) {
    const GTML = jce.encodeStruct([
        this.uin, group_id, next_uin, common.code2uin(group_id), 2, 0, 0, 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "GetTroopMemberListReq",
    };
    const body = jce.encodeWrapper({ GTML }, extra);
    const blob = await this.sendUni("friendlist.GetTroopMemberListReq", body);
    const nested = jce.decode(blob);
    const map = new Map(), next = nested[4];
    for (let v of nested[3]) {
        map.set(v[0], {
            group_id: group_id,
            user_id: v[0],
            nickname: v[4] || "",
            card: v[8] || "",
            sex: group_sex_map[v[3]] || "unknown",
            age: v[2] || 0,
            area: "unknown",
            join_time: v[15],
            last_sent_time: v[16],
            level: v[14],
            rank: "",
            role: v[18] % 2 === 1 ? "admin" : "member",
            unfriendly: false,
            title: v[23],
            title_expire_time: v[24] & 0xffffffff,
            card_changeable: true,
            shutup_time: v[30] * 1000 > Date.now() ? v[30] : 0,
            update_time: 0,
        });
    }
    try {
        const owner = this.gl.get(group_id).owner_id;
        map.get(owner).role = "owner";
    } catch (e) { }
    return { map, next };
}
/**
 * @this {import("./ref").Client}
 */
async function _getGML(group_id) {
    let mlist = new Map();
    try {
        var next = 0;
        while (1) {
            var { map, next } = await __getGML.call(this, group_id, next);
            mlist = new Map([...mlist, ...map]);
            if (!next) break;
        }
    } catch (e) { }
    if (!mlist.size) {
        this.gml.delete(group_id);
        return null;
    } else {
        this.gml.set(group_id, mlist);
        return mlist;
    }
}
/**
 * 群员列表
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function getGML(group_id, no_cache = false) {
    [group_id] = common.uinAutoCheck(group_id);
    let mlist = this.gml.get(group_id);
    if (!mlist || (no_cache && mlist instanceof Map)) {
        mlist = _getGML.call(this, group_id);
        this.gml.set(group_id, mlist);
    }
    if (mlist instanceof Promise)
        mlist = await mlist;
    if (mlist)
        return { result: 0, data: mlist };
    return { result: -1, emsg: "未加入的群" };
}

const gi_buf = pb.encode({
    1: 0,
    2: 0,
    5: 0,
    6: 0,
    15: "",
    29: 0,
    36: 0,
    37: 0,
    45: 0,
    46: 0,
    49: 0,
    54: 0,
    89: "",
});

/**
 * 群资料
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function getGI(group_id, no_cache = false) {
    [group_id] = common.uinAutoCheck(group_id);

    let ginfo = this.gl.get(group_id);
    if (!no_cache && ginfo && common.timestamp() - ginfo.update_time <= this.config.internal_cache_life)
        return { result: 0, data: ginfo };

    const body = pb.encode({
        1: this.apk.subid,
        2: {
            1: group_id,
            2: gi_buf,
        },
    });
    try {
        this.gl.get(group_id).update_time = common.timestamp();
    } catch (e) { }
    const blob = await this.sendOidb("OidbSvc.0x88d_0", body);
    const o = pb.decode(blob)[4][1][3];
    if (!o) {
        this.gl.delete(group_id);
        this.gml.delete(group_id);
        return { result: -1, emsg: "未加入的群" };
    }
    ginfo = {
        group_id: group_id,
        group_name: o[89] ? String(o[89].raw) : String(o[15].raw),
        member_count: o[6],
        max_member_count: o[5],
        owner_id: o[1],
        last_join_time: o[49],
        last_sent_time: o[54],
        shutup_time_whole: o[45] ? 0xffffffff : 0,
        shutup_time_me: o[46] * 1000 > Date.now() ? o[46] : 0,
        create_time: o[2],
        grade: o[36],
        max_admin_count: o[29],
        active_member_count: o[37],
        update_time: common.timestamp(),
    };
    this.gl.set(group_id, ginfo);
    return { result: 0, data: ginfo };
}

/**
 * 群员资料
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function getGMI(group_id, user_id, no_cache = false) {
    [group_id, user_id] = common.uinAutoCheck(group_id, user_id);
    if (!this.gml.has(group_id))
        this.getGroupMemberList(group_id);
    let minfo;
    try {
        minfo = this.gml.get(group_id).get(user_id);
    } catch (e) { }
    if (!no_cache && minfo && common.timestamp() - minfo.update_time <= this.config.internal_cache_life)
        return { result: 0, data: minfo };

    const body = pb.encode({
        1: group_id,
        2: user_id,
        3: 1,
        4: 1,
        5: 1,
    });
    try {
        this.gml.get(group_id).get(user_id).update_time = common.timestamp();
    } catch (e) { }
    const blob = await this.sendUni("group_member_card.get_group_member_card_info", body);
    const o = pb.decode(blob)[3];
    if (!o[27]) {
        try {
            this.gml.get(group_id).delete(user_id);
        } catch (e) { }
        return { result: -1, emsg: "幽灵群员" };
    }
    if (o[9] === undefined) o[9] = -1;
    const card = o[8] ? common.parseFunString(o[8].raw) : "";
    minfo = {
        group_id: group_id,
        user_id: user_id,
        nickname: Reflect.has(o, "11") ? String(o[11].raw) : "",
        card: card,
        sex: Reflect.has(o, "9") ? group_sex_map[o[9] & 0xffffffff] : "unknown",
        age: o[12] || 0,
        area: Reflect.has(o, "10") ? String(o[10].raw) : "unknown",
        join_time: o[14],
        last_sent_time: o[15],
        level: o[39],
        rank: Reflect.has(o, "13") ? String(o[13].raw) : undefined,
        role: group_role_map[o[27]],
        unfriendly: false,
        title: Reflect.has(o, "31") ? String(o[31].raw) : "",
        title_expire_time: Reflect.has(o, "32") ? o[32] : 0xffffffff,
        card_changeable: true,
        shutup_time: 0,
        update_time: common.timestamp(),
    };
    try {
        try {
            minfo.shutup_time = this.gml.get(group_id).get(user_id).shutup_time;
        } catch (e) { }
        this.gml.get(group_id).set(user_id, minfo);
    } catch (e) { }
    return { result: 0, data: minfo };
}

/**
 * 陌生人资料(也用于更新好友信息中的一些字段)
 * @this {import("./ref").Client}
 * @returns {import("./ref").ProtocolResponse}
 */
async function getSI(user_id, no_cache = false) {
    [user_id] = common.uinAutoCheck(user_id);
    let user = this.sl.get(user_id);
    if (!no_cache && user)
        return { result: 0, data: user };

    const arr = [
        null,
        0, "", [user_id], 1, 1, 0, 0, 0, 1, 0, 1
    ];
    arr[101] = 1;
    const req = jce.encodeStruct(arr);
    const extra = {
        req_id: this.seq_id + 1,
        service: "KQQ.ProfileService.ProfileServantObj",
        method: "GetSimpleInfo",
    };
    const body = jce.encodeWrapper({ req }, extra);
    const blob = await this.sendUni("ProfileService.GetSimpleInfo", body);
    const nested = jce.decode(blob);
    for (let v of nested) {
        const area = (v[13] + " " + v[14] + " " + v[15]).trim();
        const user = {
            user_id: v[1],
            nickname: v[5] || "",
            sex: group_sex_map[v[3]] || "unknown",
            age: v[4] || 0,
            area: area ? area : "unknown",
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
        return { result: 0, data: user };
    }
    return { result: -1, emsg: "没有这个人" };
}

// /**
//  * 群管理列表
//  * @this {import("./ref").Client}
//  * @returns {import("./ref").ProtocolResponse}
//  */
// async function getGAL(group_id) {
//     [group_id] = common.uinAutoCheck(group_id);
//     const body = pb.encode({
//         1: group_id,
//         2: 0,
//         3: 2,
//         5: {
//             1: 0
//         }
//     });
//     const blob = await this.sendOidb("OidbSvc.0x899_0", body);
//     const rsp = pb.decode(blob);
//     const result = rsp[3];
//     if (result === 0) {
//         const data = [];
//         if (!Array.isArray(rsp[4][4]))
//             rsp[4][4] = [rsp[4][4]];
//         for (let v of rsp[4][4])
//             data.push(v[1]);
//         return { result, data };
//     } else {
//         return { result, emsg: rsp[4][5] ? String(rsp[4][5].raw).trim() : "" };
//     }
// }

module.exports = {
    initFL, initGL,
    getGML, getGI, getGMI, getSI, //getGAL
};
