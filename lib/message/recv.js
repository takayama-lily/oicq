"use strict";
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");
const tea = require("crypto-tea");
const face = require("./face");
const { getGroupMsgs } = require("./history");
const { int32ip2str } = require("../service");
const { buildImageFileParam } = require("./image");
const { getGroupFileUrl, getC2CFileUrl } = require("./file");
const pb = require("../pb");
const { genC2CMessageId, genGroupMessageId, timestamp, parseFunString, log } = require("../common");

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
 * @this {import("../ref").Client}
 * @param {Buffer} resid 
 * @param {Number} bu 
 * @returns {Promise<Buffer>}
 */
async function downloadMultiMsg(resid, bu) {
    const body = pb.encode({
        1: 2,
        2: 5,
        3: 9,
        4: 3,
        5: this.apk.version,
        7: [{
            1: resid,
            2: 3,
        }],
        8: bu,
        9: 2,
    });
    const blob = await this.sendUni("MultiMsg.ApplyDown", body);
    const rsp = pb.decode(blob)[3];
    const ip = int32ip2str(Array.isArray(rsp[4]) ? rsp[4][0] : rsp[4]),
        port = Array.isArray(rsp[5]) ? rsp[5][0] : rsp[5];
    let url = port == 443 ? "https://ssl.htdata.qq.com" : `http://${ip}:${port}`;
    url += rsp[2].raw;
    const headers = {
        "User-Agent": `QQ/${this.apk.version} CFNetwork/1126`,
        "Net-Type": "Wifi"
    };
    return new Promise((resolve, reject) => {
        const protocol = port == 443 ? https : http;
        protocol.get(url, { headers }, (res) => {
            const data = [];
            res.on("data", (chunk) => data.push(chunk));
            res.on("end", () => {
                try {
                    let buf = Buffer.concat(data);
                    if (res.headers["accept-encoding"] && res.headers["accept-encoding"].includes("gzip"))
                        buf = zlib.unzipSync(buf);
                    const head_len = buf.readUInt32BE(1);
                    const body_len = buf.readUInt32BE(5);
                    buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), rsp[3].raw);
                    buf = pb.decode(buf)[3];
                    // if (Array.isArray(buf)) buf = buf[0];
                    buf = zlib.unzipSync(buf[3].raw);
                    resolve(buf);
                } catch (e) {
                    reject();
                }
            });
        }).on("error", reject);
    });
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Proto} elem 
 */
async function getVideoUrl(elem) {
    const body = pb.encode({
        1: 400,
        4: {
            1: this.uin,
            2: this.uin,
            3: 1,
            4: 7,
            5: elem[1],
            6: 1,
            8: elem[2],
            9: 1,
            10: 2,
            11: 2,
            12: 2,
        }
    });
    const blob = await this.sendUni("PttCenterSvr.ShortVideoDownReq", body);
    const o = pb.decode(blob)[4][9];
    return (Array.isArray(o[10]) ? o[10][1].raw : o[10].raw) + String(o[11].raw);
}

/**
 * @this {import("../ref").Client}
 */
async function parseMessage(rich, from = 0, gflag = false) {
    const elems = Array.isArray(rich[2]) ? rich[2] : [rich[2]];
    if (rich[4])
        elems.unshift(Object.setPrototypeOf({}, { 9999: rich[4] }));
    let extra = {}, anon = {};
    const chain = [];
    let raw_message = "";
    let bface_tmp = null, bface_magic = null, ignore_text = false;
    for (let v of elems) {
        const type = parseInt(Object.keys(Reflect.getPrototypeOf(v))[0]);
        const msg = { type: "", data: {} };
        let o = v[type];
        switch (type) {
        case 45: //reply
            if (Array.isArray(o[1]))
                o[1] = o[1][0];
            try {
                if (gflag) {
                    let m = await getGroupMsgs.call(this, from, o[1], o[1]);
                    m = m[0];
                    msg.data.id = genGroupMessageId(from, o[2], o[1], m[3][1][1][3], m[1][6]);
                } else {
                    let random = o[8][3];
                    if (typeof random === "bigint")
                        random = parseInt(random & 0xffffffffn);
                    msg.data.id = genC2CMessageId(from, o[1], random, o[3]);
                }
                msg.type = "reply";
            } catch { }
            break;
        case 21: //anonGroupMsg
            anon = o;
            break;
        case 16: //extraInfo
            extra = o;
            break;
        case 37: //generalFlags
            if (o[6] === 1 && o[7]) {
                const buf = await downloadMultiMsg.call(this, o[7].raw, 1);
                let msg = pb.decode(buf)[1];
                // if (Array.isArray(msg)) msg = msg[0];
                return await parseMessage.call(this, msg[3][1], from);
            }
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
            if (o[1].raw[0] > 0)
                msg.data.data = String(zlib.unzipSync(o[1].raw.slice(1)));
            else
                msg.data.data = String(o[1].raw.slice(1));
            if (o[2] > 0)
                msg.data.type = o[2];
            ignore_text = true;
            break;
        case 5: //file
            [msg.type, msg.data] = await parseTransElem.call(this, o, from);
            ignore_text = true;
            break;
        case 1: //text
            if (ignore_text) break;
            if (bface_tmp && o[1]) {
                const text = String(o[1].raw).replace("[", "").replace("]", "").trim();
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
                    msg.data.qq = "all";
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
            msg.data = parseImageElem(o, from, 1);
            break;
        case 8: //customFace
            msg.type = "image";
            msg.data = parseImageElem(o, from, 0);
            break;
        case 53: //commonElem
            if (o[1] === 3) {
                msg.type = "flash";
                if (o[2][1]) { //customFace
                    msg.data = parseImageElem(o[2][1], from, 0);
                }
                else if (o[2][2]) { //notOnlineImage
                    msg.data = parseImageElem(o[2][2], from, 1);
                }
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
        case 19: //video
            msg.type = "video";
            msg.data.file = "protobuf://" + o.raw.toString("base64");
            ignore_text = true;
            try {
                msg.data.url = await getVideoUrl.call(this, o);
            } catch { }
            break;
        case 9999: //ptt
            msg.type = "record";
            msg.data.file = "protobuf://" + o.raw.toString("base64");
            ignore_text = true;
            if (o[20]) {
                const url = String(o[20].raw);
                msg.data.url = url.startsWith("http") ? url : "https://grouptalk.c2c.qq.com" + url;
            }
            break;
        }
        if (msg.type) {
            if (msg.type === "text" && chain[chain.length - 1] && chain[chain.length - 1].type === "text")
                chain[chain.length - 1].data.text += msg.data.text;
            else
                chain.push(msg);
            if (msg.type === "text")
                raw_message += msg.data.text.replace(/[&\[\]]/g, escapeCQ);
            else
                raw_message += genCQMsg(msg);
        }
    }
    return { chain, raw_message, extra, anon };
}

/**
 * 生成CQ码字符串消息
 * @param {import("../../client").MessageElem} msg 
 * @returns {string}
 */
function genCQMsg(msg) {
    const data = querystring.stringify(msg.data, ",", "=", { encodeURIComponent: (s) => s.replace(/&|,|\[|\]/g, escapeCQInside) });
    return "[CQ:" + msg.type + (data ? "," : "") + data + "]";
}

/**
 * 解析图片protobuf
 * @param {import("../ref").Proto} o 
 * @param {number} from 
 * @param {boolean} c2c 
 */
function parseImageElem(o, from, c2c = false) {
    const data = { };
    if (c2c) {
        data.file = buildImageFileParam(o[7].raw, o[2], o[9], o[8], o[5]);
        if (o[15])
            data.url = "http://c2cpicdw.qpic.cn" + o[15].raw;
        else if (o[10])
            data.url = `http://c2cpicdw.qpic.cn/offpic_new/${from}/${o[10].raw}/0?term=2`;
    } else {
        data.file = buildImageFileParam(o[13].raw, o[25], o[22], o[23], o[20]);
        if (o[16])
            data.url = "http://gchat.qpic.cn" + o[16].raw;
        else
            data.url = `http://gchat.qpic.cn/gchatpic_new/0/${from}-0-${o[13].raw.toString("hex").toUpperCase()}/0?term=2`;
    }
    return data;
}

/**
 * 群文件
 * @param {import("../ref").Proto} o 
 * @param {number} from 
 */
async function parseTransElem(o, from) {
    let v = pb.decode(o[2].raw.slice(3))[7];
    v = v[2];
    let rsp = await getGroupFileUrl.call(this, from, v[1], v[2].raw);
    const data = {
        name: String(v[4].raw),
        url: `http://${rsp[4].raw}/ftn_handler/${rsp[6].raw.toString("hex")}/?fname=${v[4].raw}`,
        size: v[3],
        md5: rsp[9].raw.toString("hex"),
        duration: v[5],
        busid: from.toString(36) + "-" + v[1],
        fileid: String(v[2].raw)
    };
    return ["file", data];
}

/**
 * 离线文件
 * @param {import("../ref").Proto} elem 
 * @param {number} from 
 */
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

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parseC2CMsg(msg) {

    const head = msg[1], content = msg[2], body = msg[3];
    const type = head[3]; //141|166|167|208|529
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    let sub_type, message_id = "", font = "unknown";

    const sender = Object.assign({ user_id }, this.fl.get(user_id));
    if (type === 141) {
        sub_type = "other";
        if (head[8] && head[8][4]) {
            sub_type = "group";
            sender.group_id = head[8][4];
        }
    } else if (type === 167) {
        sub_type = "single";
    } else {
        sub_type = this.fl.has(user_id) ? "friend" : "single";
    }
    if (sender.nickname === undefined) {
        const stranger = (await this.getStrangerInfo(user_id, seq % 5 == 0)).data;
        if (stranger) {
            stranger.group_id = sender.group_id;
            Object.assign(sender, stranger);
            if (!this.sl.has(user_id) || timestamp() - time < 5)
                this.sl.set(user_id, stranger);
        }
    }
    try {
        message_id = genC2CMessageId(user_id, seq, body[1][1][3], time);
        font = String(body[1][1][9].raw);
    } catch { }
    if (type === 529) {
        if (head[4] !== 4)
            return;
        var { chain, raw_message } = await parseC2CFileElem.call(this, body[2][1]);
    } else if (body[1] && body[1][2]) {
        var { chain, raw_message } = await parseMessage.call(this, body[1], user_id);
    }
    return {
        sub_type, message_id, user_id,
        message: chain,
        raw_message, font, sender, time,
        auto_reply: !!(content && content[4])
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parseGroupMsg(msg) {

    const head = msg[1], body = msg[3];
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    let group = head[9],
        group_id = group[1],
        group_name = group[8] ? String(group[8].raw) : "";
    if (!group_name) {
        try {
            group_name = this.gl.get(group_id).group_name;
        } catch { }
    }

    this.msgExists(group_id, 0, seq, time);

    this.getGroupInfo(group_id);

    var { chain, raw_message, extra, anon } = await parseMessage.call(this, body[1], group_id, 1);

    let font = String(body[1][1][9].raw),
        card = parseFunString(group[4].raw);

    let anonymous = null, user = null;
    if (user_id === 80000000 && anon) {
        try {
            anonymous = {
                id: anon[6],
                name: String(anon[3].raw),
            };
            anonymous.flag = anonymous.name + "@" + anon[2].raw.toString("base64");
        } catch {
            this.logger.debug("解析匿名失败");
            this.logger.debug(anon.raw);
        }
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            if (time >= user.last_sent_time) {
                if (extra[7])
                    user.title = String(extra[7].raw);
                if (extra[3])
                    user.level = extra[3];
                if (extra[1] && !extra[2]) {
                    user.card = card = "";
                    user.nickname = String(extra[1].raw);
                } else {
                    user.card = card;
                }
                user.last_sent_time = time;
                this.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) { }
    }

    if (user) {
        var { nickname, sex, age, area, level, role, title } = user;
    } else {
        var nickname = card, sex = "unknown", age = 0, area = "", level = 0, role = "member", title = "";
    }
    const sender = {
        user_id, nickname, card, sex, age, area, level, role, title
    };
    return {
        sub_type: anonymous ? "anonymous" : "normal",
        group_id, group_name, user_id, anonymous, //message_id
        message: chain,
        raw_message, font, sender, time
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 */
async function parseDiscussMsg(msg) {

    const head = msg[1], body = msg[3];
    const user_id = head[1],
        time = head[6],
        seq = head[5];
    const discuss = head[13],
        discuss_id = discuss[1],
        discuss_name = String(discuss[5].raw);

    this.msgExists(discuss_id, 0, seq, time);

    const font = String(body[1][1][9].raw),
        card = String(discuss[4].raw),
        nickname = card;

    const sender = {
        user_id, nickname, card
    };

    const { chain, raw_message } = await parseMessage.call(this, body[1], discuss_id);

    return {
        discuss_id, discuss_name, user_id,
        message: chain,
        raw_message, font, sender, time
    };
}

module.exports = {
    parseC2CMsg, parseGroupMsg, parseDiscussMsg
};
