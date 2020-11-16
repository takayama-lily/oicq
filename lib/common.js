"use strict";
const crypto = require("crypto");
const util = require("util");

function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c)=>{
        const r = Math.random()*16|0, v = c === "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}
const timestamp = ()=>parseInt(Date.now()/1000);
const md5 = (data)=>crypto.createHash("md5").update(data).digest();

function checkUin(uin) {
    return uin >= 10000 && uin <= 0xffffffff;
}
function uinAutoCheck(group_id, user_id) {
    group_id = parseInt(group_id);
    if (arguments.length == 2)
        user_id = parseInt(user_id);
    else
        user_id = 12345;
    if (!checkUin(group_id) || !checkUin(user_id))
        throw new Error("bad group_id or user_id");
    return [group_id, user_id];
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

function escapeXml(xml) {
    return xml.replace(/[&"><]/g, function(s) {
        if (s === "&") return "&amp;";
        if (s === "<") return "&lt;";
        if (s === ">") return "&gt;";
        if (s === '"') return "&quot;";
    });
}

function log(any) {
    console.log(util.inspect(any, {depth: 20, showHidden: false, maxArrayLength: 1000, maxStringLength: 5000}));
}

function genC2CMessageId(user_id, seq, random, time) {
    const buf = Buffer.allocUnsafe(16);
    buf.writeUInt32BE(user_id),
        buf.writeInt32BE(seq&0xffffffff, 4),
        buf.writeInt32BE(random&0xffffffff, 8),
        buf.writeUInt32BE(time, 12);
    return buf.toString("base64");
}
function parseC2CMessageId(message_id) {
    const buf = Buffer.from(message_id, "base64");
    const user_id = buf.readUInt32BE(),
        seq = buf.readUInt32BE(4),
        random = buf.readUInt32BE(8),
        time = buf.readUInt32BE(12);
    return {user_id, seq, random, time};
}
function genGroupMessageId(group_id, user_id, seq, random, time) {
    const buf = Buffer.allocUnsafe(20);
    buf.writeUInt32BE(group_id),
        buf.writeUInt32BE(user_id, 4),
        buf.writeInt32BE(seq&0xffffffff, 8),
        buf.writeInt32BE(random&0xffffffff, 12),
        buf.writeUInt32BE(time, 16);
    return buf.toString("base64");
}
function parseGroupMessageId(message_id) {
    const buf = Buffer.from(message_id, "base64");
    const group_id = buf.readUInt32BE(),
        user_id = buf.readUInt32BE(4),
        seq = buf.readUInt32BE(8),
        random = buf.readUInt32BE(12),
        time = buf.readUInt32BE(16);
    return {group_id, user_id, seq, random, time};
}

module.exports = {
    uuid, md5, timestamp, checkUin, uinAutoCheck,
    log, code2uin, uin2code, escapeXml,
    genC2CMessageId, parseC2CMessageId, genGroupMessageId, parseGroupMessageId
};
