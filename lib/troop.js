/**
 * 常用群功能和好友功能
 * 相关api
 */
"use strict";
const querystring = require("querystring");
const http = require("http");
const https = require("https");
const { uinAutoCheck, md5, log } = require("./common");
const pb = require("./pb");
const jce = require("./jce");
const { downloadWebImage, highwayUpload, readFile } = require("./service");

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {boolean} enable 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setAdmin(group_id, user_id, enable = true) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const buf = Buffer.allocUnsafe(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable ? 1 : 0, 8);
    const blob = await this.sendOidb("OidbSvc.0x55c_1", buf);
    const result = pb.decode(blob)[3];
    if (result === 0) {
        try {
            const old_role = this.gml.get(group_id).get(user_id).role;
            const new_role = enable ? "admin" : "member";
            if (old_role !== new_role && old_role !== "owner") {
                this.gml.get(group_id).get(user_id).role = new_role;
                setImmediate(() => {
                    this.em("notice.group.admin", {
                        group_id, user_id, set: !!enable
                    });
                });
            }
        } catch (e) { }
    }
    return { result };
}

/**
 * 设置头衔
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {string} title 
 * @param {number} duration 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setTitle(group_id, user_id, title = "", duration = -1) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    title = String(title);
    duration = parseInt(duration) & 0xffffffff;
    const body = pb.encode({
        1: group_id,
        3: [{
            1: user_id,
            7: title,
            5: title,
            6: duration ? duration : -1
        }]
    });
    const blob = await this.sendOidb("OidbSvc.0x8fc_2", body);
    const rsp = pb.decode(blob);
    return { result: rsp[3] };
}

/**
 * 群设置
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {string} k 
 * @param {any} v 
 * @returns {import("./ref").ProtocolResponse}
 */
async function doSetting(group_id, k, v) {
    [group_id] = uinAutoCheck(group_id);
    const settings = {
        shutupTime: 17,
        ingGroupName: 3,
        ingGroupMemo: 4,
    };
    const tag = settings[k];
    if (!tag)
        throw new Error("unknown setting key");
    const body = {
        1: group_id,
        2: {},
    };
    body[2][tag] = v;
    const blob = await this.sendOidb("OidbSvc.0x89a_0", pb.encode(body));
    const rsp = pb.decode(blob);
    return { result: rsp[3] };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {string} card 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setCard(group_id, user_id, card = "") {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, String(card), 0, "", "", ""
            ])
        ]
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "ModifyGroupCardReq",
    };
    const body = jce.encodeWrapper({ MGCREQ }, extra);
    const blob = await this.sendUni("friendlist.ModifyGroupCardReq", body);
    const rsp = jce.decode(blob);
    const result = rsp[3].length > 0 ? 0 : 1;
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {boolean} block 
 * @returns {import("./ref").ProtocolResponse}
 */
async function kickMember(group_id, user_id, block = false) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const body = pb.encode({
        1: group_id,
        2: [{
            1: 5,
            2: user_id,
            3: block ? 1 : 0,
        }],
    });
    const blob = await this.sendOidb("OidbSvc.0x8a0_0", body);
    const o = pb.decode(blob)[4];
    const result = o[2][1];
    try {
        var member = this.gml.get(group_id).get(user_id);
    } catch { }
    if (result === 0 && this.gml.has(group_id) && this.gml.get(group_id).delete(user_id)) {
        setImmediate(() => {
            this.em("notice.group.decrease", {
                group_id, user_id,
                operator_id: this.uin,
                dismiss: false, member
            });
        });
    }
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {number} duration 
 * @returns {import("./ref").ProtocolResponse}
 */
async function muteMember(group_id, user_id, duration = 1800) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    duration = parseInt(duration);
    if (duration > 2592000 || duration < 0)
        duration = 2592000;
    const buf = Buffer.allocUnsafe(15);
    buf.writeUInt32BE(group_id), buf.writeUInt8(32, 4), buf.writeUInt16BE(1, 5);
    buf.writeUInt32BE(user_id, 7), buf.writeUInt32BE(duration ? duration : 0, 11);
    await this.sendOidb("OidbSvc.0x570_8", buf);
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {boolean} dismiss 
 * @returns {import("./ref").ProtocolResponse}
 */
async function quitGroup(group_id, dismiss = false) {
    [group_id] = uinAutoCheck(group_id);
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
        req_id: this.seq_id + 1,
        service: "KQQ.ProfileService.ProfileServantObj",
        method: "GroupMngReq",
    };
    const body = jce.encodeWrapper({ GroupMngReq }, extra);
    const blob = await this.sendUni("ProfileService.GroupMngReq", body);
    const rsp = jce.decode(blob);
    return { result: rsp[1] };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 发送的对象，可以是好友uin
 * @param {number} user_id 戳一戳的对象
 * @returns {import("./ref").ProtocolResponse}
 */
async function pokeMember(group_id, user_id) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const o = { 1: user_id };
    if (this.gl.has(group_id) || !this.fl.has(group_id))
        o[2] = group_id;
    else
        o[5] = group_id;
    const body = pb.encode(o);
    const blob = await this.sendOidb("OidbSvc.0xed3", body);
    const rsp = pb.decode(blob);
    return { result: rsp[3] & 0xffffffff };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {string} comment 
 * @returns {import("./ref").ProtocolResponse}
 */
async function addGroup(group_id, comment = "") {
    [group_id] = uinAutoCheck(group_id);
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
        req_id: this.seq_id + 1,
        service: "KQQ.ProfileService.ProfileServantObj",
        method: "GroupMngReq",
    };
    const body = jce.encodeWrapper({ GroupMngReq }, extra);
    const blob = await this.sendUni("ProfileService.GroupMngReq", body);
    const rsp = jce.decode(blob);
    return { result: rsp[1] };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @returns {import("./ref").ProtocolResponse}
 */
async function inviteFriend(group_id, user_id) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const body = pb.encode({
        1: group_id,
        2: { 1: user_id }
    });
    const blob = await this.sendOidb("OidbSvc.oidb_0x758", body);
    const result = pb.decode(blob)[4].raw.length > 6 ? 0 : 1;
    return { result };
}

/**
 * 启用/禁用 匿名
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {boolean} enable 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setAnonymous(group_id, enable = true) {
    [group_id] = uinAutoCheck(group_id);
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt32BE(group_id), buf.writeUInt8(enable ? 1 : 0, 4);
    const blob = await this.sendOidb("OidbSvc.0x568_22", buf);
    const rsp = pb.decode(blob);
    return { result: rsp[3] };
}

/**
 * @param {string} flag 
 */
function _parseAnonFlag(flag) {
    const split = flag.split("@");
    return {
        id: split[1],
        nick: split[0],
    };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {string} flag 
 * @param {number} duration
 * @returns {import("./ref").ProtocolResponse} 
 */
async function muteAnonymous(group_id, flag, duration = 1800) {
    [group_id] = uinAutoCheck(group_id);
    duration = parseInt(duration);
    if (duration > 2592000 || duration < 0)
        duration = 2592000;
    const { id, nick } = _parseAnonFlag(flag);
    const body = querystring.stringify({
        anony_id: id,
        group_code: group_id,
        seconds: duration,
        anony_nick: nick,
        bkn: (await this.getCsrfToken()).data.token
    });
    const cookie = (await this.getCookies("qqweb.qq.com")).data.cookies;
    try {
        const rsp = await new Promise((resolve, reject) => {
            https.request("https://qqweb.qq.com/c/anonymoustalk/blacklist", {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded", cookie
                }
            }, (res) => {
                res.on("data", (chunk) => {
                    try {
                        const data = JSON.parse(chunk);
                        resolve({
                            result: data.retcode,
                            emsg: data.msg
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on("error", reject).end(body);
        });
        return rsp;
    } catch (e) {
        return { result: -1, emsg: e.message };
    }
}

/**
 * @param {import("./ref").MediaFile} file 
 * @returns {Promise<Buffer>}
 */
async function _getImgBuf(file) {
    let buf;
    if (file instanceof Buffer) {
        buf = file;
    } else {
        file = String(file).trim();
        if (file.startsWith("base64://")) {
            buf = Buffer.from(file.replace("base64://", ""), "base64");
        } else if (file.startsWith("http")) {
            buf = await downloadWebImage(file);
        } else {
            file = file.replace(/^file:\/{2,3}/, "");
            buf = await readFile(file);
        }
    }
    return buf;
}

/**
 * 设置头像
 * @this {import("./ref").Client}
 * @param {string|Buffer} file 
 */
async function setPortrait(file) {
    const buf = await _getImgBuf(file);
    const body = pb.encode({
        1281: {
            1: this.uin,
            2: 0,
            3: 16,
            4: 1,
            6: 3,
            7: 5,
        }
    });
    const blob = await this.sendUni("HttpConn.0x6ff_501", body);
    const rsp = pb.decode(blob)[1281];
    await highwayUpload.call(this, rsp[3][2][0][2], rsp[3][2][0][3], {
        buf, md5: md5(buf), key: rsp[1].raw
    }, 5);
    return { result: 0 };
}

/**
 * 群头像
 * @this {import("./ref").Client}
 * @param {string|Buffer} file 
 */
async function setGroupPortrait(group_id, file) {
    [group_id] = uinAutoCheck(group_id);
    const buf = await _getImgBuf(file);
    await this.getCookies();
    const url = `http://htdata3.qq.com/cgi-bin/httpconn?htcmd=0x6ff0072&ver=5520&ukey=${this.sig.skey}&range=0&uin=${this.uin}&seq=${this.seq_id}&groupuin=${group_id}&filetype=3&imagetype=5&userdata=0&subcmd=1&subver=101&clip=0_0_0_0&filesize=${buf.length}`;
    try {
        await new Promise((resolve, reject) => {
            http.request(url, { method: "POST" }, (res) => {
                if (res.statusCode === 200)
                    resolve();
                else
                    reject();
            }).on("error", (e) => reject(e.message)).end(buf);
        });
        return { result: 0 };
    } catch (e) {
        return { result: -1, emsg: e };
    }
}

/**
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @param {number} times 1~20
 * @returns {import("./ref").ProtocolResponse}
 */
async function sendLike(user_id, times = 1) {
    [user_id] = uinAutoCheck(user_id);
    times = parseInt(times);
    if (!(times > 0 && times <= 20))
        times = 1;
    const ReqFavorite = jce.encodeStruct([
        jce.encodeNested([
            this.uin, 1, this.seq_id + 1, 1, 0, Buffer.from("0C180001060131160131", "hex")
        ]),
        user_id, 0, 1, times
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "VisitorSvc",
        method: "ReqFavorite",
    };
    const body = jce.encodeWrapper({ ReqFavorite }, extra);
    const blob = await this.sendUni("VisitorSvc.ReqFavorite", body);
    const rsp = jce.decode(blob);
    return { result: rsp[0][3], emsg: rsp[0][4] };
}

/**
 * 获取对方加好友设置(暂不对外开放)
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @returns {number}
 */
async function _getAddSetting(user_id) {
    const FS = jce.encodeStruct([
        this.uin,
        user_id, 3004, 0, null, 1
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "GetUserAddFriendSettingReq",
    };
    const body = jce.encodeWrapper({ FS }, extra);
    const blob = await this.sendUni("friendlist.getUserAddFriendSetting", body);
    const rsp = jce.decode(blob);
    if (rsp[4]) return false;
    return rsp[2];
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {string} comment 
 * @returns {import("./ref").ProtocolResponse}
 */
async function addFriend(group_id, user_id, comment = "") {
    if (group_id == 0) {
        group_id = 0;
        [user_id] = uinAutoCheck(user_id);
    } else {
        [group_id, user_id] = uinAutoCheck(group_id, user_id);
    }
    const type = await _getAddSetting.call(this, user_id);
    if (![0, 1, 4].includes(type))
        return { result: type };
    comment = String(comment);
    const AF = jce.encodeStruct([
        this.uin,
        user_id, type ? 1 : 0, 1, 0, Buffer.byteLength(comment), comment, 0, 1, null, 3004,
        11, null, null, group_id ? pb.encode({ 1: group_id }) : null, 0, null, null, 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "AddFriendReq",
    };
    const body = jce.encodeWrapper({ AF }, extra);
    const blob = await this.sendUni("friendlist.addFriend", body);
    const rsp = jce.decode(blob);
    return { result: rsp[6] };
}

/**
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @param {boolean} block 
 * @returns {import("./ref").ProtocolResponse}
 */
async function delFriend(user_id, block = true) {
    [user_id] = uinAutoCheck(user_id);
    const DF = jce.encodeStruct([
        this.uin,
        user_id, 2, block ? 1 : 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "DelFriendReq",
    };
    const body = jce.encodeWrapper({ DF }, extra);
    const blob = await this.sendUni("friendlist.delFriend", body);
    const rsp = jce.decode(blob);
    return { result: rsp[2] };
}

/**
 * 设置个人资料
 * @this {import("./ref").Client}
 * @param {number} k 
 * @param {Buffer|string} v 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setProfile(k, v) {
    v = Buffer.from(v);
    const buf = Buffer.allocUnsafe(11 + v.length);
    buf.writeUInt32BE(this.uin), buf.writeUInt8(0, 4);
    buf.writeInt32BE(k, 5), buf.writeUInt16BE(v.length, 9);
    buf.fill(v, 11);
    const blob = await this.sendOidb("OidbSvc.0x4ff_9", buf);
    const o = pb.decode(blob);
    if (o[3] === 34)
        o[3] = 0;
    return { result: o[3] };
}

/**
 * 设置签名
 * @this {import("./ref").Client}
 * @param {string} sign 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setSign(sign = "") {
    sign = Buffer.from(String(sign)).slice(0, 254);
    const body = pb.encode({
        1: 2,
        2: Date.now(),
        3: {
            1: 109,
            2: { 6: 825110830 },
            3: this.apk.ver
        },
        5: {
            1: this.uin,
            2: 0,
            3: 27 + sign.length,
            4: Buffer.concat([
                Buffer.from([0x3, sign.length + 1, 0x20]), sign,
                Buffer.from([0x91, 0x04, 0x00, 0x00, 0x00, 0x00, 0x92, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA2, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA3, 0x04, 0x00, 0x00, 0x00, 0x00])
            ]),
            5: 0
        },
        6: 1
    });
    const blob = await this.sendUni("Signature.auth", body);
    const rsp = pb.decode(blob);
    return { result: rsp[1], emsg: rsp[2] };
}

/**
 * 设置在线状态
 * @this {import("./ref").Client}
 * @param {number} status 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setStatus(status) {
    status = parseInt(status);
    if (![11, 31, 41, 50, 60, 70].includes(status))
        throw new Error("bad status");
    let sub = 0;
    if (status > 1000) {
        sub = status, status = 11;
    }
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        7, 0, "", status, 0, 0, 0, 0, 0, 248,
        this.device.version.sdk, 0, "", 0, null, this.device.guid, 2052, 0, this.device.model, this.device.model,
        this.device.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
        "", "", null, 1, null, 0, null, sub, 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "PushService",
        method: "SvcReqRegister",
    };
    const body = jce.encodeWrapper({ SvcReqRegister }, extra);
    const blob = await this.sendUni("StatSvc.SetStatusFromClient", body);
    const rsp = jce.decode(blob);
    let result = -1;
    if (rsp[9]) {
        result = 0;
        this.online_status = status;
    }
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {number} group_id 
 * @returns {import("./ref").ProtocolResponse}
 */
async function getGroupNotice(group_id) {
    [group_id] = uinAutoCheck(group_id);
    const cookie = (await this.getCookies("qun.qq.com")).data.cookies;
    const url = `https://web.qun.qq.com/cgi-bin/announce/get_t_list?bkn=${(await this.getCsrfToken()).data.token}&qid=${group_id}&ft=23&s=-1&n=20`;
    try {
        let data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { cookie } }, (res) => {
                if (res.statusCode !== 200) {
                    return reject("statusCode: " + res.statusCode);
                }
                res.setEncoding("utf-8");
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try {
                        data = JSON.parse(data);
                        if (data.ec !== 0) {
                            return reject(data.em);
                        }
                        resolve(data.feeds ? data.feeds : []);
                    } catch {
                        reject("response error");
                    }
                });
            }).on("error", (e) => reject(e.message));
        });
        return { result: 0, data };
    } catch (e) {
        return { result: -1, emsg: e };
    }
}

/**
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @returns {import("./ref").ProtocolResponse}
 */
async function getLevelInfo(user_id) {
    [user_id] = uinAutoCheck(user_id);
    const cookie = (await this.getCookies("vip.qq.com")).data.cookies;
    const url = `https://club.vip.qq.com/api/vip/getQQLevelInfo?requestBody={"iUin":${user_id}}`;
    try {
        let data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { cookie } }, (res) => {
                if (res.statusCode !== 200) {
                    return reject("statusCode: " + res.statusCode);
                }
                res.setEncoding("utf-8");
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try {
                        data = JSON.parse(data);
                        if (data.ret !== 0) {
                            return reject(data.msg);
                        }
                        resolve(data.data.mRes);
                    } catch {
                        reject("response error");
                    }

                });
            }).on("error", (e) => reject(e.message));
        });
        return { result: 0, data };
    } catch (e) {
        return { result: -1, emsg: e };
    }
}

module.exports = {
    setAdmin, setTitle, setCard, doSetting, setAnonymous, muteAnonymous, getGroupNotice,
    kickMember, muteMember, pokeMember, quitGroup, addGroup, inviteFriend,
    setStatus, setProfile, setSign, sendLike, addFriend, delFriend, setPortrait, setGroupPortrait, getLevelInfo
};
