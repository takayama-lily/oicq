"use strict";
const fs = require("fs");
const {uinAutoCheck, md5} = require("./common");
const {downloadWebImage, highwayUpload} = require("./service");
const pb = require("./pb");
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
    const body = pb.encode("IndividualPortraitReqPkg", {
        body: {
            uin: this.uin,
            reqChannelType: 0,
            subcmd: 16,
            buType: 1,
            netType: 3,
            termType: 5,
        }
    });
    const blob = await this.sendUNI("HttpConn.0x6ff_501", body);
    const resp = pb.decode("IndividualPortraitRspPkg", blob).body;
    highwayUpload.call(this, resp.entry.ipport[0].uint32UpIp, resp.entry.ipport[0].uint32UpPort, {
        buf, md5: md5(buf), key: resp.upUkey
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
    const o = pb.decode("OIDBSSOPkg", blob);
    if (o.result === 34)
        o.result = 0;
    return o;
}

async function setSign(sign = "") {
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
            ver: this.apkver.substr(0, 5)
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