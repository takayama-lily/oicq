"use strict";
const crypto = require("crypto");
const querystring = require("querystring");
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
const now = ()=>Date.now()&0xffffffff;
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

function genMessageId(uin, seq, random) {
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(uin), buf.writeInt32BE(seq, 4), buf.writeInt32BE(random, 8);
    return buf.toString("hex");
}
function parseMessageId(message_id) {
    const buf = Buffer.from(message_id, "hex");
    const uin = buf.readUInt32BE(), seq = buf.readInt32BE(4), random = buf.readInt32BE(8);
    return {uin, seq, random};
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
    buf.writeUInt32BE(toInt(user_id)), buf.writeUInt32BE(toInt(group_id), 4);
    buf.writeInt32BE(seq.low, 8), buf.writeInt32BE(seq.high, 12), buf.writeInt8(invite, 16);
    return buf.toString("hex");
}
function parseGroupRequestFlag(flag) {
    const buf = Buffer.from(flag, "hex");
    const user_id = buf.readUInt32BE(), group_id = buf.readUInt32BE(4);
    const low = buf.readInt32BE(8), high = buf.readInt32BE(12);
    return {user_id, group_id, low, high, invite: buf[16]};
}

function toCQAt(user_id) {
    return `[CQ:at,qq=${user_id}]`;
}
function toCQFace(id) {
    return `[CQ:face,id=${id}]`;
}
function toCQImage(file) {
    return `[CQ:image,file=${file}]`;
}

function parseMessage(elems) {
    const chain = [];
    let raw_message = "";
    for (let v of elems) {
        const type = Object.keys(v)[0];
        const msg = {type:"",data:{}};
        switch (type) {
            case "richMsg":
            case "lightApp":
            case "transElemInfo":
                break;
            case "text":
                if (v.text.attr6Buf && v.text.attr6Buf[1] === 1) {
                    msg.type = "at";
                    if (v.text.attr6Buf[6] === 1)
                        msg.data.qq = "all"
                    else
                        msg.data.qq = v.text.attr6Buf.slice(7, 11).readUInt32BE();
                    chain.push(msg);
                    raw_message += toCQAt(msg.data.qq);
                    break;
                }
                if (chain[chain.length-1] && chain[chain.length-1].type === type) {
                    chain[chain.length-1].data.text += v.text.str;
                } else {
                    msg.type = "text", msg.data.text = v.text.str;
                    chain.push(msg);
                }
                raw_message += v.text.str;
                break;
            case "face":
                msg.type = "face", msg.data.id = v.face.index;
                chain.push(msg)
                raw_message += toCQFace(msg.data.id);
                break;
            case "customFace":
                msg.type = "image", msg.data.file = v.customFace.md5.toString("hex") + v.customFace.size;
                chain.push(msg);
                raw_message += toCQImage(msg.data.file);
                break;
        }
    }
    return {chain, raw_message};
}

const AT_BUF = Buffer.from([0,1,0,0,0]);
const BUF00 = Buffer.from([0,0]);
const FACE_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xCC, 0xF5, 0xD0]);
const PB_BUF = Buffer.from([
    0x08, 0x09, 0x78, 0x00, 0xC8, 0x01, 0x00, 0xF0, 0x01, 0x00, 0xF8, 0x01, 0x00, 0x90, 0x02, 0x00,
    0xC8, 0x02, 0x00, 0x98, 0x03, 0x00, 0xA0, 0x03, 0x20, 0xB0, 0x03, 0x00, 0xC0, 0x03, 0x00, 0xD0,
    0x03, 0x00, 0xE8, 0x03, 0x00, 0x8A, 0x04, 0x02, 0x08, 0x03, 0x90, 0x04, 0x80, 0x80, 0x80, 0x10,
    0xB8, 0x04, 0x00, 0xC0, 0x04, 0x00,
]);

function buildTextMessage(text) {
    return {text: {str: text}};
}
function buildAtMessage(qq) {
    if (qq === "all") {
        var q = 0, flag = 1, display = "@全体成员";
    } else {
        var q = parseInt(qq), flag = 0, display = q.toString();
    }
    const buf = Buffer.alloc(6);
    buf.writeUInt8(display.length), buf.writeUInt8(flag, 1), buf.writeUInt32BE(q, 2);
    return {
        text: {
            str: display,
            attr6Buf: Buffer.concat([AT_BUF, buf, BUF00])
        }
    };
}
function buildFaceMessage(id) {
    id = parseInt(id);
    const old = Buffer.alloc(2);
    old.writeUInt16BE(0x1445 - 4 + id);
    return {
        face: {
            index: id,
            old: old,
            buf: FACE_BUF
        }
    };
}
function buildImageMessage() {

}
function build_extra(chain, is_group) {
    if (is_group) {
        chain.push({
            generalFlags: {
                pbReserve: PB_BUF
            }
        })
    }
    return chain;
}

function buildFromCQ(chain, cq) {
    cq = cq.replace("[CQ:", "cqtype=");
    cq = cq.substr(0, cq.length - 1);
    cq = querystring.parse(cq, ",");
    switch (cq.cqtype.trim()) {
        case "at":
            chain.push(buildAtMessage(cq.qq));
            break;
        case "face":
            chain.push(buildFaceMessage(cq.id));
            break;
        case "image":
        default:
            break;
    }
}
function buildMessageFromString(message, escape = false, is_group = true) {
    const chain = [];
    if (escape) {
        chain.push(buildTextMessage(message));
        return build_extra(chain, is_group);
    }
    const res = message.matchAll(/\[CQ:[^\]]+\]/g);
    for (let v of res) {
        const text = message.substr(0, v.index);
        if (text)
            chain.push(buildTextMessage(text));
        const cq = v[0];
        buildFromCQ(chain, cq);
        message = message.substr(v.index+cq.length);
    }
    chain.push(buildTextMessage(message));
    return build_extra(chain, is_group);
}

function buildMessage(message, escape, is_group) {
    if (typeof message === "string")
        return buildMessageFromString(message, escape, is_group);
    const chain = [];
    for (let v of message) {
        switch (v.type) {
            case "text":
                chain.push(buildTextMessage(v.data.text));
                break;
            case "at":
                chain.push(buildAtMessage(v.data.qq));
                break;
            case "face":
                chain.push(buildFaceMessage(v.data.id));
                break;
            case "image":
            default:
                break;
        }
    }
    return build_extra(chain, is_group);
}

function toInt(req_uin) {
    if (typeof req_uin === "number")
        return req_uin;
    if (typeof req_uin === "object") {
        if (req_uin.high === 0)
            return req_uin.low;
        const high = BigInt(req_uin.high), low = BigInt(req_uin.low);
        return (high<<32n) | low;
    }
}

module.exports = {
    rand, uuid, now, md5, timestamp, buildUinBuf, buildApiRet, toInt,
    genMessageId, parseMessageId,
    genFriendRequestFlag, genGroupRequestFlag, parseFriendRequestFlag, parseGroupRequestFlag,
    parseMessage, buildMessage
};
