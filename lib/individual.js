"use strict";
const http = require("http");
const {uinAutoCheck, md5} = require("./common");
const {downloadWebImage, highwayUpload, readFile} = require("./service");
const pb = require("./pb");
const jce = require("./jce");

/**
 * @param {String|Buffer} file 
 * @returns {Buffer}
 */
async function getImgBuf(file) {
    let buf;
    if (file instanceof Buffer) {
        buf = file; 
    } else {
        file = String(file).trim();
        if (file.startsWith("base64://")) {
            buf = Buffer.from(file.replace("base64://", ""), "base64");
        } else if (file.startsWith("http")) {
            try {
                buf = await downloadWebImage(file);
            } catch (e) {
                throw new Error(e);
            }
        } else {
            file = file.replace(/^file:\/{2,3}/, "");
            try {
                buf = await readFile(file);
            } catch (e) {
                throw new Error(e);
            }
        }
    }
    return buf;
}

/**
 * 设置头像
 * @this {import("./ref").Client}
 * @param {String|Buffer} file 
 */
async function setPortrait(file) {
    const buf = await getImgBuf(file);
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
    const blob = await this.sendUNI("HttpConn.0x6ff_501", body);
    const rsp = pb.decode(blob)[1281];
    await highwayUpload.call(this, rsp[3][2][0][2], rsp[3][2][0][3], {
        buf, md5: md5(buf), key: rsp[1].raw
    }, 5);
    return {result: 0};
}

/**
 * 群头像
 * @this {import("./ref").Client}
 * @param {String|Buffer} file 
 */
async function setGroupPortrait(group_id, file) {
    var [group_id] = uinAutoCheck(group_id);
    const buf = await getImgBuf(file);
    await this.getCookies();
    const url = `http://htdata3.qq.com/cgi-bin/httpconn?htcmd=0x6ff0072&ver=5520&ukey=${this.sig.skey}&range=0&uin=${this.uin}&seq=${this.seq_id}&groupuin=${group_id}&filetype=3&imagetype=5&userdata=0&subcmd=1&subver=101&clip=0_0_0_0&filesize=${buf.length}`;
    try {
        await new Promise((resolve, reject)=>{
            http.request(url, {method:"POST"}, (res)=>{
                if (res.statusCode === 200)
                    resolve();
                else
                    reject();
            }).on("error", (e)=>reject(e.message)).end(buf);
        });
        return {result: 0};
    } catch (e) {
        return {result: 102, emsg: e};
    }
}

/**
 * @this {import("./ref").Client}
 * @param {Number} user_id 
 * @param {Number} times 1~20
 * @returns {import("./ref").ProtocolResponse}
 */
async function sendLike(user_id, times = 1) {
    var [user_id] = uinAutoCheck(user_id);
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
        req_id:  this.seq_id + 1,
        service: "VisitorSvc",
        method:  "ReqFavorite",
    };
    const body = jce.encodeWrapper({ReqFavorite}, extra);
    const blob = await this.sendUNI("VisitorSvc.ReqFavorite", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: jce.decode(parent[0])[3]};
}

/**
 * 获取对方加好友设置(暂不对外开放)
 * @this {import("./ref").Client}
 * @param {Number} user_id 
 * @returns {Number}
 */
async function getAddSetting(user_id) {
    const FS = jce.encodeStruct([
        this.uin,
        user_id, 3004, 0, null, 1
    ]);
    const extra = {
        req_id:  this.seq_id + 1,
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

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {String} comment 
 * @returns {import("./ref").ProtocolResponse}
 */
async function addFriend(group_id, user_id, comment = "") {
    if (group_id == 0) {
        group_id = 0;
        var [user_id] = uinAutoCheck(user_id);
    } else
        var [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const type = await getAddSetting.call(this, user_id);
    if (![0, 1, 4].includes(type))
        return {result: type};
    comment = String(comment);
    const AF = jce.encodeStruct([
        this.uin,
        user_id, type?1:0, 1, 0, Buffer.byteLength(comment), comment, 0, 1, null, 3004,
        11, null, null, group_id?pb.encode({1:group_id}):null, 0, null, null, 0
    ]);
    const extra = {
        req_id:  this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "AddFriendReq",
    };
    const body = jce.encodeWrapper({AF}, extra);
    const blob = await this.sendUNI("friendlist.addFriend", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[6]};
}

/**
 * @this {import("./ref").Client}
 * @param {Number} user_id 
 * @param {Boolean} block 
 * @returns {import("./ref").ProtocolResponse}
 */
async function delFriend(user_id, block = true) {
    var [user_id] = uinAutoCheck(user_id);
    const DF = jce.encodeStruct([
        this.uin,
        user_id, 2, block?1:0
    ]);
    const extra = {
        req_id:  this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "DelFriendReq",
    };
    const body = jce.encodeWrapper({DF}, extra);
    const blob = await this.sendUNI("friendlist.delFriend", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return {result: parent[2]};
}

/**
 * 设置个人资料
 * @this {import("./ref").Client}
 * @param {Number} k 
 * @param {Buffer|String} v 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setProfile(k, v) {
    v = Buffer.from(v);
    const buf = Buffer.allocUnsafe(11 + v.length);
    buf.writeUInt32BE(this.uin), buf.writeUInt8(0, 4);
    buf.writeInt32BE(k, 5), buf.writeUInt16BE(v.length, 9);
    buf.fill(v, 11);
    const blob = await this.sendUNI("OidbSvc.0x4ff_9", buf);
    const o = pb.decode(blob);
    if (o[3] === 34)
        o[3] = 0;
    return {result: o[3]};
}

/**
 * 设置签名
 * @this {import("./ref").Client}
 * @param {String} sign 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setSign(sign = "") {
    sign = Buffer.from(String(sign)).slice(0, 254);
    const body = pb.encode({
        1: 2,
        2: Date.now(),
        3: {
            1: 109,
            2: {6: 825110830},
            3: this.apk.ver
        },
        5: {
            1: this.uin,
            2: 0,
            3: 27 + sign.length,
            4: Buffer.concat([
                Buffer.from([0x3, sign.length+1, 0x20]), sign, 
                Buffer.from([0x91,0x04,0x00,0x00,0x00,0x00,0x92,0x04,0x00,0x00,0x00,0x00,0xA2,0x04,0x00,0x00,0x00,0x00,0xA3,0x04,0x00,0x00,0x00,0x00])
            ]),
            5: 0
        },
        6: 1
    });
    const blob = await this.sendUNI("Signature.auth", body);
    const rsp = pb.decode(blob);
    return {result: rsp[1], emsg: rsp[2]};
}

/**
 * 设置在线状态
 * @this {import("./ref").Client}
 * @param {Number} status 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setStatus(status) {
    if (this.config.platform !== 1)
        throw new Error("platform not supported");
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
        req_id:  this.seq_id + 1,
        service: "PushService",
        method:  "SvcReqRegister",
    };
    const body = jce.encodeWrapper({SvcReqRegister}, extra);
    const blob = await this.sendUNI("StatSvc.SetStatusFromClient", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    let result = 1;
    if (parent[9]) {
        result = 0;
        this.online_status = status;
    }
    return {result};
}

module.exports = {
    setStatus, setProfile, setSign, sendLike, addFriend, delFriend, setPortrait, setGroupPortrait
};