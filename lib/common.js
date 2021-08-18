/**
 * 通用函数
 */
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const stream = require("stream");
const zlib = require("zlib");
const util = require("util");
const pb = require("./algo/pb");

function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
const timestamp = () => Math.floor(Date.now() / 1000);
const md5 = (data) => crypto.createHash("md5").update(data).digest();
const sha1 = (data) => crypto.createHash("sha1").update(data).digest();

const pipeline = util.promisify(stream.pipeline);
const unzip = util.promisify(zlib.unzip);

/**
 * @param {stream.Readable} readable 
 * @returns {Promise<Buffer>}
 */
function md5Stream(readable) {
    return new Promise((resolve, reject) => {
        readable.on("error", reject);
        readable.pipe(
            crypto.createHash("md5")
                .on("error", reject)
                .on("data", resolve)
        );
    });
}

/**
 * @param {string} filepath 
 * @returns {Promise<[Buffer, Buffer]>}
 */
function fileHash(filepath) {
    const readable = fs.createReadStream(filepath);
    const sha1 = new Promise((resolve, reject) => {
        readable.on("error", reject);
        readable.pipe(
            crypto.createHash("sha1")
                .on("error", reject)
                .on("data", resolve)
        );
    });
    return Promise.all([md5Stream(readable), sha1]);
}

function checkUin(uin) {
    return uin >= 10000 && uin <= 0xffffffff;
}
const UIN_ERROR = new Error("bad group_id or user_id");
/**
 * @param {number} gid 
 * @param {number} uid 
 */
function uinAutoCheck(gid, uid) {
    gid = parseInt(gid);
    if (!checkUin(gid)) {
        throw UIN_ERROR;
    }
    if (arguments.length === 2) {
        uid = parseInt(uid);
        if (!checkUin(uid))
            throw UIN_ERROR;
    }
    return [gid, uid];
}

/**
 * @param {number} groupCode 
 */
function code2uin(groupCode) {
    let left = Math.floor(groupCode / 1000000);
    if (left >= 0 && left <= 10)
        left += 202;
    else if (left >= 11 && left <= 19)
        left += 469;
    else if (left >= 20 && left <= 66)
        left += 2080;
    else if (left >= 67 && left <= 156)
        left += 1943;
    else if (left >= 157 && left <= 209)
        left += 1990;
    else if (left >= 210 && left <= 309)
        left += 3890;
    else if (left >= 310 && left <= 334)
        left += 3490;
    else if (left >= 335 && left <= 386) //335 336不确定
        left += 2265;
    else if (left >= 387 && left <= 499)
        left += 3490;

    return left * 1000000 + groupCode % 1000000;
}

/**
 * @param {number} groupUin 
 */
function uin2code(groupUin) {
    let left = Math.floor(groupUin / 1000000);
    if (left >= 202 && left <= 212)
        left -= 202;
    else if (left >= 480 && left <= 488)
        left -= 469;
    else if (left >= 2100 && left <= 2146)
        left -= 2080;
    else if (left >= 2010 && left <= 2099)
        left -= 1943;
    else if (left >= 2147 && left <= 2199)
        left -= 1990;
    else if (left >= 2600 && left <= 2651)
        left -= 2265;
    else if (left >= 3800 && left <= 3989)
        left -= 3490;
    else if (left >= 4100 && left <= 4199)
        left -= 3890;
    return left * 1000000 + groupUin % 1000000;
}

function log(any) {
    console.log(util.inspect(any, { depth: 20, showHidden: false, maxArrayLength: 1000, maxStringLength: 20000 }));
}

/**
 * 生成私聊消息id
 * @param {number} user_id 对方QQ号
 * @param {number} seq 序号
 * @param {number} random 随机数
 * @param {number} time unix时间戳
 * @param {number} flag 接收为0 发送为1
 */
function genC2CMessageId(user_id, seq, random, time, flag = 0) {
    const buf = Buffer.allocUnsafe(17);
    buf.writeUInt32BE(user_id);
    buf.writeInt32BE(seq & 0xffffffff, 4);
    buf.writeInt32BE(random & 0xffffffff, 8);
    buf.writeUInt32BE(time, 12);
    buf.writeUInt8(flag, 16);
    return buf.toString("base64");
}

/**
 * 解析私聊消息id
 * @param {string} message_id 
 */
function parseC2CMessageId(message_id) {
    const buf = Buffer.from(message_id, "base64");
    const user_id = buf.readUInt32BE(),
        seq = buf.readUInt32BE(4),
        random = buf.readUInt32BE(8),
        time = buf.readUInt32BE(12),
        flag = buf.length >= 17 ? buf.readUInt8(16) : 0;
    return { user_id, seq, random, time, flag };
}

/**
 * 生成群消息id
 * @param {number} group_id 群号
 * @param {number} user_id 发送者QQ号
 * @param {number} seq 序号
 * @param {number} random 随机数
 * @param {number} time unix时间戳
 * @param {number} pktnum 分片数
 */
function genGroupMessageId(group_id, user_id, seq, random, time, pktnum = 1) {
    const buf = Buffer.allocUnsafe(21);
    buf.writeUInt32BE(group_id);
    buf.writeUInt32BE(user_id, 4);
    buf.writeInt32BE(seq & 0xffffffff, 8);
    buf.writeInt32BE(random & 0xffffffff, 12);
    buf.writeUInt32BE(time, 16);
    buf.writeUInt8(pktnum > 1 ? pktnum : 1, 20);
    return buf.toString("base64");
}

/**
 * 解析群消息id
 * @param {string} message_id 
 */
function parseGroupMessageId(message_id) {
    const buf = Buffer.from(message_id, "base64");
    const group_id = buf.readUInt32BE(),
        user_id = buf.readUInt32BE(4),
        seq = buf.readUInt32BE(8),
        random = buf.readUInt32BE(12),
        time = buf.readUInt32BE(16),
        pktnum = buf.length >= 21 ? buf.readUInt8(20) : 1;
    return { group_id, user_id, seq, random, time, pktnum };
}

/**
 * @param {number} random 
 */
function genMessageUuid(random) {
    return 16777216n << 32n | BigInt(random);
}

/**
 * @param {bigint} msg_uuid 
 */
function genRandom(msg_uuid) {
    return Number(BigInt(msg_uuid) & 0xffffffffn);
}

/**
 * 解析彩色群名片
 * @param {Buffer} buf 
 */
function parseFunString(buf) {
    if (buf[0] === 0xa) {
        let res = "";
        try {
            let arr = pb.decode(buf)[1];
            if (!Array.isArray(arr))
                arr = [arr];
            for (let v of arr) {
                if (v[2])
                    res += String(v[2]);
            }
        } catch { }
        return res;
    } else {
        return String(buf);
    }
}

module.exports = {
    uuid, md5, sha1, md5Stream, timestamp, checkUin, uinAutoCheck, fileHash, pipeline, unzip,
    log, code2uin, uin2code, parseFunString,
    genC2CMessageId, parseC2CMessageId, genGroupMessageId, parseGroupMessageId, genMessageUuid, genRandom,
    BUF0: Buffer.alloc(0),
    BUF16: Buffer.alloc(16),
    NOOP: () => { },
};
