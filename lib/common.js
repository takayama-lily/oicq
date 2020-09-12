"use strict";
const crypto = require("crypto");
const util = require("util");

function rand(n = 9) {
    const max = 10**n - n;
    const min = 10**(n-1) + n;
    return parseInt(Math.random()*(max-min)+min);
}
function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c)=>{
        const r = Math.random()*16|0, v = c === "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}
const timestamp = ()=>parseInt(Date.now()/1000);
const now = ()=>parseInt(BigInt(Date.now())&0xffffffffn);
const md5 = (data)=>crypto.createHash("md5").update(data).digest();

function buildUinBuf(uin) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(uin);
    return buf;
}

function buildApiRet(retcode, data = null, extra = null) {
    return {
        retcode, data,
        status: retcode?(retcode===1?"async":"failed"):"ok",
        ...extra
    };
}

function genSelfMessageId(user_id, seq, random, pkg = 1, timestamp = undefined) {
    const buf = Buffer.alloc(9);
    buf.writeUInt32BE(user_id), buf.writeUInt16BE(seq, 4), buf.writeUInt16BE(random, 6), buf.writeUInt8(pkg, 8);
    if (timestamp) {
        const buf2 = Buffer.alloc(4);
        buf2.writeUInt32BE(timestamp);
        return Buffer.concat([buf, buf2]).toString("hex");
    }
    return buf.toString("hex");
}
function parseSelfMessageId(message_id) {
    const buf = Buffer.from(message_id, "hex");
    const user_id = buf.readUInt32BE(), seq = buf.readUInt16BE(4), random = buf.readUInt16BE(6), pkg = buf.readInt8(8), timestamp = buf.readUInt32BE(9);
    return {user_id, seq, random, pkg, timestamp};
}

function genGroupMessageId(group_id, seq, random) {
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(group_id), buf.writeInt32BE(seq, 4), buf.writeInt32BE(random, 8);
    return buf.toString("hex");
}
function parseGroupMessageId(message_id) {
    const buf = Buffer.from(message_id, "hex");
    const group_id = buf.readUInt32BE(), seq = buf.readInt32BE(4), random = buf.readInt32BE(8);
    return {group_id, seq, random};
}

function genFriendRequestFlag(user_id, seq) {
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(user_id), buf.writeInt32BE(seq.low, 4), buf.writeInt32BE(seq.high, 8);
    return buf.toString("hex");
}
function parseFriendRequestFlag(flag) {
    const buf = Buffer.from(flag, "hex");
    const user_id = buf.readUInt32BE(), low = buf.readInt32BE(4), high = buf.readInt32BE(8);
    return {user_id, low, high};
}
function genGroupRequestFlag(user_id, group_id, seq, invite) {
    const buf = Buffer.alloc(17);
    buf.writeUInt32BE(user_id), buf.writeUInt32BE(group_id, 4);
    buf.writeInt32BE(seq.low, 8), buf.writeInt32BE(seq.high, 12), buf.writeInt8(invite, 16);
    return buf.toString("hex");
}
function parseGroupRequestFlag(flag) {
    const buf = Buffer.from(flag, "hex");
    const user_id = buf.readUInt32BE(), group_id = buf.readUInt32BE(4);
    const low = buf.readInt32BE(8), high = buf.readInt32BE(12);
    return {user_id, group_id, low, high, invite: buf[16]};
}

function toInt(uin) {
    if (typeof uin === "number")
        return uin;
    if (typeof uin === "bigint")
        return parseInt(uin);
    return parseInt((BigInt(uin.high)<<32n)|(BigInt(uin.low)&0xffffffffn));
}

/**
 * @param {Number} uin 
 * @returns {Boolean}
 */
function checkUin(uin) {
    return uin > 10000 && uin < 0xffffffff;
}

function code2uin(groupCode) {
    let left = parseInt(groupCode / 1000000);
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
    else if (left >= 310 && left <= 499)
        left += 3490;
    else if (left >= 210 && left <= 309)
        left += 3890;
    return left * 1000000 + groupCode % 1000000;
}
function uin2code(groupUin) {
    let left = parseInt(groupUin / 1000000);
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
    else if (left >= 3800 && left <= 3989)
        left -= 3490;
    else if (left >= 4100 && left <= 4199)
        left -= 3890;
    return left * 1000000 + groupUin % 1000000;
}

function log(any) {
    console.log(util.inspect(any, {depth: 20}));
}

module.exports = {
    rand, uuid, now, md5, timestamp, buildUinBuf, buildApiRet, toInt, checkUin,
    genGroupMessageId, parseGroupMessageId, genSelfMessageId, parseSelfMessageId,
    genFriendRequestFlag, genGroupRequestFlag, parseFriendRequestFlag, parseGroupRequestFlag,
    log, code2uin, uin2code
};
