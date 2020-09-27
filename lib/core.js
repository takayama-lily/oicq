"use strict";
const zlib = require("zlib");
const tea = require("crypto-tea");
const Readable = require("stream").Readable;
const ecdh = require("./wtlogin/ecdh");
const Writer = require("./wtlogin/writer");
const common = require("./common");
const jce = require("./jce");
const chat = require("./chat");
const indi = require("./individual");
const push = require("./online-push");
const BUF0 = Buffer.alloc(0);

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
            return chat.getMsg.call(this, 0);
        case 84:
        case 87:
            return indi.getNewGroup.call(this);
        case 187:
            return indi.getNewFriend.call(this);
    }
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
            decrypted = tea.decrypt(decrypted, this.sign_info.d2key);
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

/**
 * @param {String} cmd 
 * @param {Buffer} body 
 * @param {Buffer} ext_data 
 * @returns {Buffer}
 */
function buildUNIPacket(cmd, body, ext_data = BUF0) {
    this.logger.trace(`send:${cmd} seq:${this.seq_id}`);
    this.send_timestamp = Date.now();
    let uni = new Writer()
        .writeWithLength(cmd)
        .writeU32(8)
        .writeBytes(this.session_id)
        .writeWithLength(ext_data)
        .read();
    uni = new Writer().writeWithLength(uni).writeWithLength(body).read();
    uni = new Writer()
        .writeU32(0x0B)
        .writeU8(1) // body type
        .writeU32(this.seq_id)
        .writeU8(0)
        .writeWithLength(this.uin.toString())
        .writeBytes(tea.encrypt(uni, this.sign_info.d2key))
        .read();
    return new Writer().writeWithLength(uni).read();
}

module.exports = {
    parseIncomingPacket, buildUNIPacket
};
