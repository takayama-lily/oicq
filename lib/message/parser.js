"use strict";
const zlib = require("zlib");
const querystring = require("querystring");
const face = require("./face");
const {getGroupMsgBySeq} = require("./history");
const {downloadMultiMsg} = require("./img-ptt-up-down");
const {getGroupFileUrl, getC2CFileUrl} = require("./file");
const pb = require("../pb");
const {genC2CMessageId, genGroupMessageId, timestamp} = require("../common");

function escapeCQInside(s) {
    if (s === "&") return "&amp;";
    if (s === ",") return "&#44;";
    if (s === "[") return "&#91;";
    if (s === "]") return "&#93;";
}
function escapeCQ(s) {
    if (s === "&") return "&amp;";
    if (s === "[") return "&#91;";
    if (s === "]") return "&#93;";
}

/**
 * @this {import("./ref").Client}
 */
async function parseMessage(rich, from = 0, gflag = false) {
    const elems = Array.isArray(rich[2]) ? rich[2] : [rich[2]];
    if (rich[4])
        elems.unshift(Object.setPrototypeOf({}, {9999: rich[4]}));
    let extra = {}, anon = {};
    const chain = [];
    let raw_message = "";
    let bface_tmp = null, bface_magic = null, ignore_text = false;
    for (let v of elems) {
        const type = parseInt(Object.keys(Reflect.getPrototypeOf(v))[0]);
        const msg = {type:"",data:{}};
        const o = v[type];
        switch (type) {
            case 45: //reply
                if (Array.isArray(o[1]))
                    o[1] = o[1][0];
                try {
                    if (gflag) {
                        const m = await getGroupMsgBySeq.call(this, from, o[1]);
                        msg.data.id = genGroupMessageId(from, o[2], o[1], m[3][1][1][3], m[1][6]);
                    } else {
                        let random = o[8][3];
                        if (typeof random === "bigint")
                            random = parseInt(random&0xffffffffn);
                        msg.data.id = genC2CMessageId(from, o[1], random, o[3]);
                    }
                    msg.type = "reply";
                } catch {}
                break;
            case 21: //anonGroupMsg
                anon = o;
                break;
            case 16: //extraInfo
                extra = o;
                break;
            case 37: //generalFlags
                if (o[6] === 1 && o[7])
                    return await parseMultiMsg.call(this, o[7].raw, from);
                break;
            case 34: //sface
                msg.type = "sface";
                msg.data.id = o[1];
                break;
            case 17:
                msg.type = "shake";
                ignore_text = true;
                break;
            case 12: //xml
            case 51: //json
                msg.type = type === 12 ? "xml" : "json";
                msg.data.data = String(zlib.unzipSync(o[1].raw.slice(1)));
                ignore_text = true;
                break;
            case 5: //file
                [msg.type, msg.data] = await parseTransElem.call(this, o, from);
                ignore_text = true;
                break;
            case 1: //text
                if (ignore_text) break;
                if (bface_tmp && o[1]) {
                    const text = String(o[1].raw).replace("[","").replace("]","").trim();
                    if (text.includes("猜拳") && bface_magic) {
                        msg.type = "rps";
                        msg.data.id = bface_magic.raw[16] - 0x30 + 1;
                    } else if (text.includes("骰子") && bface_magic) {
                        msg.type = "dice";
                        msg.data.id = bface_magic.raw[16] - 0x30 + 1;
                    } else {
                        msg.data.file = bface_tmp, msg.type = "bface";
                        msg.data.text = text;
                    }
                    bface_tmp = null;
                    bface_magic = null;
                    break;
                }
                if (o[3] && o[3].raw[1] === 1) {
                    msg.type = "at";
                    if (o[3].raw[6] === 1)
                        msg.data.qq = "all"
                    else
                        msg.data.qq = o[3].raw.readUInt32BE(7);
                } else {
                    msg.type = "text";
                }
                msg.data.text = String(o[1].raw);
                break;
            case 2: //face
                msg.type = "face", msg.data.id = o[1];
                break;
            case 6: //bface
                bface_tmp = o[4].raw.toString("hex") + o[7].raw.toString("hex") + o[5];
                bface_magic = o[12];
                break;
            case 4: //notOnlineImage
                msg.type = "image";
                msg.data.file = o[7].raw.toString("hex") + (o[2]?o[2]:"");
                if (o[15])
                    msg.data.url = "http://c2cpicdw.qpic.cn" + o[15].raw;
                else
                    msg.data.url = `http://c2cpicdw.qpic.cn/offpic_new/${from}/${o[10].raw}/0?term=2`;
                break;
            case 8: //customFace
                msg.type = "image";
                msg.data.file = o[13].raw.toString("hex") + (o[25]?o[25]:"");
                if (o[16])
                    msg.data.url = "http://gchat.qpic.cn" + o[16].raw;
                else
                    msg.data.url = `http://gchat.qpic.cn/gchatpic_new/0/${from}-${o[7]}-${o[13].raw.toString("hex").toUpperCase()}/0?term=2`;
                break;
            case 53: //commonElem
                if (o[1] === 3) {
                    msg.type = "flash";
                    if (o[2][1]) //notOnlineImage
                        msg.data.file = o[2][1][13].raw.toString("hex") + (o[2][1][25]?o[2][1][25]:"");
                    else if (o[2][2]) //customFace
                        msg.data.file = o[2][1][7].raw.toString("hex") + (o[2][1][2]?o[2][1][2]:"");
                    ignore_text = true;
                } else if (o[1] === 33) {
                    msg.type = "face";
                    msg.data.id = o[2][1];
                    if (face.map[msg.data.id])
                        msg.data.text = face.map[msg.data.id];
                    else if (o[2][2])
                        msg.data.text = String(o[2][2].raw);
                } else if (o[1] === 2) {
                    msg.type = "poke";
                    msg.data.type = o[3];
                    if (o[3] === 126) {
                        msg.data.id = o[2][4];
                        msg.data.name = face.pokemap[o[2][4]];
                    } else {
                        msg.data.id = -1;
                        msg.data.name = face.pokemap[o[3]];
                    }
                    ignore_text = true;
                }
                break;
            case 9999: //ptt
                [msg.type, msg.data] = await parsePttElem.call(this, o, from);
                ignore_text = true;
                break;
        }
        if (msg.type) {
            if (msg.type === "text" && chain[chain.length-1] && chain[chain.length-1].type === "text")
                chain[chain.length-1].data.text += msg.data.text;
            else
                chain.push(msg);
            if (msg.type === "text")
                raw_message += msg.data.text.replace(/[&\[\]]/g, escapeCQ);
            else
                raw_message += genCQMsg(msg);
        }
    }
    return {chain, raw_message, extra, anon};
}

function genCQMsg(msg) {
    const data = querystring.stringify(msg.data, ",", "=", {encodeURIComponent: (s)=>s.replace(/&|,|\[|\]/g, escapeCQInside)});
    return `[CQ:` + msg.type + (data ? "," : "") + data + `]`;
}

async function parseMultiMsg(resid, from) {
    const buf = await downloadMultiMsg.call(this, resid, 1);
    let msg = pb.decode(buf)[1];
    // if (Array.isArray(msg)) msg = msg[0];
    return await parseMessage.call(this, msg[3][1], from);
}

async function parsePttElem(o) {
    const data = {md5: o[4].raw.toString("hex")};
    if (o[20]) {
        const url =  String(o[20].raw);
        data.file = url.startsWith("http") ? url : "https://grouptalk.c2c.qq.com" + url;
    } else if (o[3]) {
        data.file = o[3].raw.toString("hex");
    }
    return ["record", data];
}

async function parseTransElem(o, from) {
    let v = pb.decode(o[2].raw.slice(3))[7];
    v = v[2];
    let rsp = await getGroupFileUrl.call(this, from, v[1], v[2].raw);
    const data = {
        name:     String(v[4].raw),
        url:      `http://${rsp[4].raw}/ftn_handler/${rsp[6].raw.toString("hex")}/?fname=${v[4].raw}`,
        size:     v[3],
        md5:      rsp[9].raw.toString("hex"),
        duration: v[5],
        busid:    from.toString(36) + "-" + v[1],
        fileid:   String(v[2].raw)
    };
    return ["file", data];
}

async function parseC2CFileElem(elem) {
    const fileid = elem[3].raw,
        md5 = elem[4].raw.toString("hex"),
        name = String(elem[5].raw),
        size = elem[6],
        duration = elem[51] ? timestamp() + elem[51] : 0;
    const url = await getC2CFileUrl.call(this, fileid);
    const msg = {
        type: "file",
        data: {
            name, url, size, md5, duration,
            busid: "0",
            fileid: String(fileid)
        }
    };
    const raw_message = genCQMsg(msg);
    return {
        raw_message, chain: [msg]
    };
}

module.exports = {
    parseMessage, parseC2CFileElem
};
