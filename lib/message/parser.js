/**
 * 解析消息节点
 */
"use strict";
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const tea = require("../algo/tea");
const pb = require("../algo/pb");
const face = require("./face");
const { getGroupMsgs } = require("./history");
const { int32ip2str } = require("../service");
const { buildImageFileParam } = require("./image");
const { Gfs, getC2CFileUrl } = require("./file");
const { getVideoUrl } = require("./ptt");
const { genC2CMessageId, genGroupMessageId, timestamp, parseFunString, code2uin, genRandom, unzip } = require("../common");

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
async function _downloadMultiMsg(resid, bu) {
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
    url += rsp[2];
    const headers = {
        "User-Agent": `QQ/${this.apk.version} CFNetwork/1126`,
        "Net-Type": "Wifi"
    };
    return new Promise((resolve, reject) => {
        const protocol = port == 443 ? https : http;
        protocol.get(url, { headers }, (res) => {
            const data = [];
            res.on("data", (chunk) => data.push(chunk));
            res.on("end", async () => {
                try {
                    let buf = Buffer.concat(data);
                    if (res.headers["accept-encoding"] && res.headers["accept-encoding"].includes("gzip"))
                        buf = await unzip(buf);
                    const head_len = buf.readUInt32BE(1);
                    const body_len = buf.readUInt32BE(5);
                    buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), rsp[3].toBuffer());
                    buf = pb.decode(buf)[3];
                    // if (Array.isArray(buf)) buf = buf[0];
                    buf = await unzip(buf[3].toBuffer());
                    resolve(buf);
                } catch (e) {
                    e.message = "wrong resid";
                    reject(e);
                }
            });
        }).on("error", reject);
    });
}

/**
 * 解析消息
 */
class Parser {

    /**
     * @type {import("../ref").MessageElem[]}
     */
    message = [];
    raw_message = "";

    /**
     * @type {import("../ref").Anonymous}
     */
    anonymous = null;

    /**
     * @type {import("../ref").Proto}
     */
    extra;

    /**
     * @private
     * 排他型消息：语音、视频、闪照、json、xml、poke、文件
     */
    exclusive = false;

    /**
     * @private
     * @type {IterableIterator<[number, import("../ref").Proto]>}
     */
    it;

    atme = false;

    /**
     * @public
     * @param {import("../ref").Client} c 
     * @param {number} uid
     * @param {number} gid
     * @param {import("../ref").RichMsg} rich 
     */
    static async invoke(c, uid, gid, rich) {
        const parser = new Parser(c, uid, gid)
        await parser.parseMsg(rich);
        return parser;
    }
    
    /**
     * @private
     * @param {import("../ref").Client} c 
     * @param {number} uid 发送者 
     * @param {number} gid 群号 
     */
    constructor(c, uid, gid) {
        this.c = c;
        this.uid = uid;
        this.gid = gid;
    }

    /**
     * @private
     * @param {import("../ref").RichMsg} rich 
     */
    async parseMsg(rich) {
        let elems = rich[2], ptt = rich[4];
        if (!Array.isArray(elems))
            elems = [elems];
        if (ptt)
            await this.parseExclusiveElem(0, ptt);
        await this.parseElems(elems);
    }

    /**
     * 获取下一个节点的文本
     * @private
     * @returns {string}
     */
    getNextText() {
        try {
            const elem = this.it.next().value[1][1];
            return String(elem[1]);
        } catch {
            return "[未知]";
        }
    }

    /**
     * 解析排他型消息节点
     * xml, json, ptt, video, flash, file, shake, poke
     * @private
     * @param {number} type 
     * @param {import("../ref").Proto} elem 
     */
    async parseExclusiveElem(type, elem) {
        /**
         * @type {import("../ref").MessageElem}
         */
        const msg = {
            type: "",
            data: {}
        };
        let brief = "";
        switch (type) {
        case 12: //xml
        case 51: //json
            msg.type = type === 12 ? "xml" : "json";
            if (elem[1].toBuffer()[0] > 0)
                msg.data.data = String(await unzip(elem[1].toBuffer().slice(1)));
            else
                msg.data.data = String(elem[1].toBuffer().slice(1));
            if (elem[2] > 0)
                msg.data.type = elem[2];
            brief = `[${msg.type}消息]`;
            break;
        case 3: //flash
            msg.type = "flash";
            msg.data = this.parseImgElem(elem);
            brief = "[闪照]";
            break;
        case 0: //ptt
            msg.type = "record";
            msg.data.file = "protobuf://" + elem.toBase64();
            if (elem[20]) {
                const url = String(elem[20]);
                msg.data.url = url.startsWith("http") ? url : "https://grouptalk.c2c.qq.com" + url;
            }
            brief = "[语音]";
            break;
        case 19: //video
            msg.type = "video";
            msg.data.file = "protobuf://" + elem.toBase64();
            try {
                msg.data.url = await getVideoUrl.call(this.c, elem);
            } catch { }
            brief = "[视频]";
            break;
        case 5: //transElem
            msg.type = "file";
            msg.data = await this.parseTransElem(elem);
            brief = "[群文件]";
            break;
        case 17: //shake
            msg.type = "shake";
            brief = "[窗口抖动]";
            break;
        case 126: //poke
            if (!elem[3]) {
                msg.type = "shake";
                brief = "[窗口抖动]";
                break;
            }
            msg.type = "poke";
            msg.data.type = elem[3];
            if (elem[3] === 126) {
                msg.data.id = elem[2][4];
                msg.data.name = face.pokemap[elem[2][4]];
            } else {
                msg.data.id = -1;
                msg.data.name = face.pokemap[elem[3]];
            }
            brief = "[" + msg.data.name + "]";
            break;
        default:
            return;
        }
        this.exclusive = true;
        this.message = [msg];
        if (this.c.config.brief)
            this.raw_message = brief;
        else
            this.raw_message = genCQMsg(msg);
    }

    /**
     * 解析连续型消息节点
     * text, at, face, bface, sface, image, mirai
     * @private
     * @param {number} type 
     * @param {import("../ref").Proto} elem 
     */
    parsePartialElem(type, elem) {
        /**
         * @type {import("../ref").MessageElem}
         */
        const msg = {
            type: "",
            data: {}
        };
        let brief = "";
        switch (type) {
        case 1: //text&at
            brief = String(elem[1]);
            if (elem[3] && elem[3].toBuffer()[1] === 1) {
                msg.type = "at";
                if (elem[3].toBuffer()[6] === 1) {
                    msg.data.qq = "all";
                } else {
                    msg.data.qq = elem[3].toBuffer().readUInt32BE(7);
                    if (msg.data.qq === this.c.uin)
                        this.atme = true;
                }
                brief = "@" + brief ? brief : msg.data.qq;
            } else {
                if (!brief)
                    return;
                msg.type = "text";
            }
            msg.data.text = brief;
            break;
        case 2: //face
            msg.type = "face";
            msg.data.id = elem[1];
            msg.data.text = face.map[msg.data.id] || "表情";
            brief = `[${msg.data.text}]`;
            break;
        case 33: //face(id>255)
            msg.type = "face";
            msg.data.id = elem[1];
            msg.data.text = face.map[msg.data.id];
            if (!msg.data.text)
                msg.data.text = elem[2] ? String(elem[2]) : ("/" + msg.data.id);
            brief = msg.data.text;
            break;
        case 6: //bface
            brief = this.getNextText();
            if (brief.includes("骰子") || brief.includes("猜拳")) {
                msg.type = brief.includes("骰子") ? "dice" : "rps";
                msg.data.id = elem[12].toBuffer()[16] - 0x30 + 1;
            } else {
                msg.type = "bface";
                msg.data.file = elem[4].toHex() + elem[7].toHex() + elem[5];
                msg.data.text = brief.replace(/[[\]]/g, "");
            }
            break;
        case 4:
        case 8:
            msg.type = "image";
            msg.data = this.parseImgElem(elem);
            brief = "[图片]";
            break;
        case 34: //sface
            brief = this.getNextText();
            msg.type = "sface";
            msg.data.id = elem[1];
            msg.data.text = brief.replace(/[[\]]/g, "");
            break;
        case 31: //mirai
            if (elem[3] === 103904510) {
                brief = String(elem[2]);
                msg.type = "mirai";
                msg.data.data = brief;
            } else {
                return;
            }
            break;
        default:
            return;
        }
        if (msg.type === "text") {
            if (!this.c.config.brief)
                brief = msg.data.text.replace(/[&[\]]/g, escapeCQ);
            if (this.message.length > 0 && this.message[this.message.length - 1].type === "text") {
                //合并文本节点
                this.message[this.message.length - 1].data.text += msg.data.text;
            } else {
                this.message.push(msg);
            }
        } else {
            if (!this.c.config.brief)
                brief = genCQMsg(msg);
            this.message.push(msg);
        }
        this.raw_message += brief;
    }

    /**
     * @private
     * @param {import("../ref").Proto[]} elems 
     */
    async parseElems(elems) {
        this.it = elems.entries();
        while (true) {
            let wrapper = this.it.next().value;
            if (!wrapper)
                break;
            wrapper = wrapper[1];
            const type = parseInt(Object.keys(Reflect.getPrototypeOf(wrapper))[0]);
            const elem = wrapper[type];
            if (type === 16) { //extraInfo 额外情报
                this.extra = elem;
            } else if (type === 21) { //anonGroupMsg 匿名情况
                try {
                    const name = String(elem[3]);
                    this.anonymous = {
                        id: elem[6], name,
                        flag: name + "@" + elem[2].toBase64(),
                    };
                } catch {
                    this.c.logger.warn("解析匿名失败");
                }
            } else if (type === 37) { //generalFlags 超长消息，气泡等
                if (elem[6] === 1 && elem[7]) {
                    const buf = await _downloadMultiMsg.call(this.c, elem[7].toBuffer(), 1);
                    let msg = pb.decode(buf)[1];
                    if (Array.isArray(msg)) msg = msg[0];
                    const parser = Parser.invoke(this.c, this.uid, this.gid, msg[3][1]);
                    this.message = parser.message;
                    this.raw_message = parser.raw_message;
                    this.anonymous = parser.anonymous;
                    this.extra = parser.extra;
                    return;
                }
            } else if (!this.exclusive) {
                switch (type) {
                case 1: //text
                case 2: //face
                case 4: //notOnlineImage
                case 6: //bface
                case 8: //customFace
                case 31: //mirai
                case 34: //sface
                    this.parsePartialElem(type, elem);
                    break;
                case 5: //transElem
                case 12: //xml
                case 17: //shake
                case 19: //video
                case 51: //json
                    await this.parseExclusiveElem(type, elem);
                    break;
                case 53: //commonElem
                    if (elem[1] === 3) { //flash
                        await this.parseExclusiveElem(3, elem[2][1] ? elem[2][1] : elem[2][2]);
                    } else if (elem[1] === 33) { //face(id>255)
                        this.parsePartialElem(33, elem[2]);
                    } else if (elem[1] === 2) { //poke
                        await this.parseExclusiveElem(126, elem);
                    }
                    break;
                case 45: //reply
                    await this.parseReplyElem(elem);
                    break;
                default:
                    break;
                }
            }
        }
    }

    /**
     * 解析图片
     * @private
     * @param {import("../ref").Proto} elem 
     */
    parseImgElem(elem) {
        const data = { };
        if (!this.gid) { //私图
            data.file = buildImageFileParam(elem[7].toHex(), elem[2], elem[9], elem[8], elem[5]);
            if (elem[15])
                data.url = "https://c2cpicdw.qpic.cn" + elem[15];
            else if (elem[10])
                data.url = `https://c2cpicdw.qpic.cn/offpic_new/${this.uid}/${elem[10]}/0?term=2`;
        } else { //群图
            data.file = buildImageFileParam(elem[13].toHex(), elem[25], elem[22], elem[23], elem[20]);
            if (elem[16])
                data.url = "https://gchat.qpic.cn" + elem[16];
            else
                data.url = `https://gchat.qpic.cn/gchatpic_new/${this.uid}/${code2uin(this.gid)}-${elem[7]>>>0}-${elem[13].toHex().toUpperCase()}/0?term=2`;
        }
        return data;
    }

    /**
     * 解析回复message_id
     * @private
     * @param {import("../ref").Proto} elem 
     */
    async parseReplyElem(elem) {
        if (Array.isArray(elem[1]))
            elem[1] = elem[1][0];
        try {
            const msg = {
                type: "reply",
                data: {
                    id: ""
                }
            };
            let seq = elem[1], user_id = elem[2];
            if (this.gid) {
                let m = (await getGroupMsgs.call(this.c, this.gid, seq, seq))[0];
                let random = m[3][1][1][3];
                let time = m[1][6];
                msg.data.id = genGroupMessageId(this.gid, user_id, seq, random, time);
            } else {
                let random = genRandom(elem[8][3]);
                let time = elem[3];
                let flag = user_id === this.c.uin ? 1 : 0;
                msg.data.id = genC2CMessageId(this.uid, seq, random, time, flag);
            }
            this.message.unshift(msg);
            this.raw_message = (this.c.config.brief ? "[回复]" : genCQMsg(msg)) + this.raw_message;
        } catch { }
    }

    /**
     * 解析群文件
     * @private
     * @param {import("../ref").Proto} elem 
     */
    parseTransElem(elem) {
        elem = pb.decode(elem[2].toBuffer().slice(3))[7][2];
        const fid = String(elem[2]);
        const gfs = new Gfs(this.c, this.gid);
        return gfs.download(fid);
    }
}

/**
 * 生成CQ码字符串消息
 * @param {import("../ref").MessageElem} msg 
 * @returns {string}
 */
function genCQMsg(msg) {
    const data = querystring.stringify(msg.data, ",", "=", { encodeURIComponent: (s) => s.replace(/&|,|\[|\]/g, escapeCQInside) });
    return "[CQ:" + msg.type + (data ? "," : "") + data + "]";
}

/**
 * 解析离线文件
 * @this {import("../ref").Client}
 * @param {import("../ref").Proto} elem 
 * @param {number} from 
 */
async function _parseC2CFileElem(elem) {
    const fileid = elem[3].toBuffer(),
        md5 = elem[4].toHex(),
        name = String(elem[5]),
        size = elem[6],
        duration = elem[51] ? timestamp() + elem[51] : 0;
    const url = await getC2CFileUrl.call(this, fileid);
    const message = {
        type: "file",
        data: {
            name, url, size, md5, duration,
            busid: 0,
            fileid: String(fileid)
        }
    };
    const raw_message = this.config.brief ? "[离线文件]" : genCQMsg(message);
    return {
        message, raw_message
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 * @param {boolean} realtime 
 */
async function parseC2CMsg(msg, realtime = false) {

    const head = msg[1], content = msg[2], body = msg[3];
    const type = head[3]; //141|166|167|208|529
    let from_uin = head[1], to_uin = head[2], flag = 0,
        seq = head[5], random = genRandom(head[7]),
        time = body[1] && body[1][1] ? body[1][1][2] : head[6];
    let uid = from_uin;
    if (from_uin === this.uin) {
        uid = to_uin;
        flag = 1;
    }
    let sub_type,
        message_id = genC2CMessageId(uid, seq, random, time, flag),
        font = body[1] && body[1][1] ? String(body[1][1][9]) : "unknown";

    const sender = Object.assign({ user_id: from_uin }, this.fl.get(from_uin));
    if (type === 141) {
        sub_type = "other";
        if (head[8] && head[8][4]) {
            sub_type = "group";
            sender.group_id = head[8][4];
        }
    } else if (type === 167) {
        sub_type = "single";
    } else {
        sub_type = this.fl.has(from_uin) ? "friend" : "single";
    }
    if (sender.nickname === undefined) {
        const stranger = (await this.getStrangerInfo(from_uin, seq % 5 == 0 && realtime)).data;
        if (stranger) {
            stranger.group_id = sender.group_id;
            Object.assign(sender, stranger);
            if (!this.sl.has(from_uin) || realtime)
                this.sl.set(from_uin, stranger);
        }
    }
    if (type === 529) {
        if (head[4] === 4) {
            var parser = await _parseC2CFileElem.call(this, body[2][1]);
        } else if (head[4] === 7 && body[2][6]) {
            const elem = {
                type: "text",
                data: {
                    text: String(body[2][6][5][1][2])
                }
            };
            var parser = {
                message: elem,
                raw_message: genCQMsg(elem)
            };
            sub_type = "self";
        } else {
            return;
        }
    } else if (body[1] && body[1][2]) {
        var parser = await Parser.invoke(this, uid, 0, body[1]);
    } else {
        return;
    }
    return {
        sub_type, message_id, user_id: from_uin,
        message: parser.message,
        raw_message: parser.raw_message,
        font, sender, time,
        auto_reply: !!(content && content[4])
    };
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Msg} msg 
 * @param {boolean} realtime 
 */
async function parseGroupMsg(msg, realtime = false) {

    const head = msg[1], content = msg[2], body = msg[3];
    const user_id = head[1],
        time = head[6],
        seq = head[5],
        random = body[1][1][3];
    let group = head[9],
        group_id = group[1],
        group_name = group[8] ? String(group[8]) : "";
    if (!group_name) {
        try {
            group_name = this.gl.get(group_id).group_name;
        } catch { }
    }

    if (realtime) {
        this.msgExists(group_id, 0, seq, time);
        this.getGroupInfo(group_id);
    }

    const parser = await Parser.invoke(this, user_id, group_id, body[1]);

    let font = String(body[1][1][9]),
        card = parseFunString(group[4].toBuffer()),
        message_id = genGroupMessageId(group_id, user_id, seq, random, time, content[1]);

    let user;
    if (!parser.anonymous) {
        try {
            try {
                user = this.gml.get(group_id).get(user_id);
                this.getGroupMemberInfo(group_id, user_id);
            } catch {
                user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            }
            if (user && realtime) {
                const extra = parser.extra;
                if (extra[7])
                    user.title = String(extra[7]);
                if (extra[3])
                    user.level = extra[3];
                if (extra[1] && !extra[2]) {
                    user.card = card = "";
                    user.nickname = String(extra[1]);
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
        sub_type: parser.anonymous ? "anonymous" : "normal",
        message_id, group_id, group_name, user_id,
        anonymous: parser.anonymous,
        message: parser.message,
        raw_message: parser.raw_message,
        atme: parser.atme,
        block: group[2] === 127,
        seqid: seq,
        font, sender, time
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
        discuss_name = String(discuss[5]);

    this.msgExists(discuss_id, 0, seq, time);

    const font = String(body[1][1][9]),
        card = String(discuss[4]),
        nickname = card;

    const sender = {
        user_id, nickname, card
    };

    const parser = await Parser.invoke(this, user_id, discuss_id, body[1]);

    return {
        discuss_id, discuss_name, user_id,
        message: parser.message,
        raw_message: parser.raw_message,
        atme: parser.atme,
        font, sender, time
    };
}

/**
 * 解析转发消息
 * @this {import("../ref").Client}
 * @param {string} resid 
 * @returns {import("../ref").ProtocolResponse}
 */
async function parseForwardMsg(resid) {
    const data = [];
    const blob = await _downloadMultiMsg.call(this, String(resid), 2);
    /**
     * @type {import("../ref").Msg[]}
     */
    let msgs = pb.decode(blob)[2];
    if (Array.isArray(msgs))
        msgs = msgs[0];
    msgs = msgs[2][1];
    if (!Array.isArray(msgs))
        msgs = [msgs];
    for (let msg of msgs) {
        const head = msg[1];
        let time = head[6];
        let user_id = head[1], nickname = "unknown", group_id;
        if (head[14]) {
            nickname = String(head[14]);
        } else {
            try {
                nickname = String(head[9][4]);
                group_id = head[9][1];
            } catch { }
        }
        const parser = await Parser.invoke(this, user_id, group_id, msg[3][1]);
        data.push({
            group_id, user_id, nickname, time,
            message: parser.message,
            raw_message: parser.raw_message
        });
    }
    return { result: 0, data };
}

module.exports = {
    parseC2CMsg, parseGroupMsg, parseDiscussMsg, genCQMsg, parseForwardMsg
};
