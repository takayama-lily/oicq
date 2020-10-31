"use strict";
const fs = require("fs");
const {uinAutoCheck, md5} = require("./common");
const {downloadWebImage, highwayUpload} = require("./service");
const pb = require("./pb2");
const jce = require("./jce");

async function setPortrait(file) {
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
            try {
                buf = await fs.promises.readFile(file)
            } catch (e) {
                throw new Error("Local file not exists: " + file);
            }
        }
        if (!buf || !buf.length)
            throw new Error("Fail to get file: " + file);
    }
    this.nextSeq();
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
    highwayUpload.call(this, rsp[3][2][0][2]&0xffffffff, rsp[3][2][0][3], {
        buf, md5: md5(buf), key: rsp[1].raw
    }, 5);
}

async function sendLike(user_id, times = 1) {
    var [user_id] = uinAutoCheck(user_id);
    times = parseInt(times);
    if (!(times > 0 && times <= 20))
        times = 1;
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

async function delFriend(user_id, block = true) {
    var [user_id] = uinAutoCheck(user_id);
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

async function setSign(sign = "") {
    sign = Buffer.from(String(sign)).slice(0, 254);
    this.nextSeq();
    const body = pb.encode({
        1: 2,
        2: Date.now(),
        3: {
            1: 109,
            2: {6: 825110830},
            3: this.apkver.substr(0, 5)
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
        req_id:  this.nextSeq(),
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
    setStatus, setProfile, setSign, sendLike, addFriend, delFriend, setPortrait,
};