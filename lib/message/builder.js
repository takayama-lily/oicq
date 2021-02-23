"use strict";
const zlib = require("zlib");
const music = require("./music");
const face = require("./face");
const { getOneC2CMsg, getOneGroupMsg } = require("./history");
const { genPttElem } = require("./ptt");
const { ImageBuilder, uploadImages } = require("./image");
const pb = require("../pb");
const common = require("../common");
const { parseC2CMessageId, parseGroupMessageId, genMessageUuid } = common;
const EMOJI_NOT_ENDING = ["\uD83C", "\uD83D", "\uD83E", "\u200D"];
const EMOJI_NOT_STARTING = ["\uFE0F", "\u200D", "\u20E3"];

function unescapeCQ(s) {
    if (s === "&#91;") return "[";
    if (s === "&#93;") return "]";
    if (s === "&amp;") return "&";
}
function unescapeCQInside(s) {
    if (s === "&#44;") return ",";
    if (s === "&#91;") return "[";
    if (s === "&#93;") return "]";
    if (s === "&amp;") return "&";
}
function escapeXml(str) {
    return str.replace(/[&"><]/g, function (s) {
        if (s === "&") return "&amp;";
        if (s === "<") return "&lt;";
        if (s === ">") return "&gt;";
        if (s === "\"") return "&quot;";
    });
}

/**
 * @this {import("../ref").Client}
 */
async function getAnonInfo(group_id) {
    const body = pb.encode({
        1: 1,
        10: {
            1: this.uin,
            2: group_id
        }
    });
    let anon = null;
    try {
        const blob = await this.sendUni("group_anonymous_generate_nick.group", body);
        const rsp = pb.decode(blob)[11];
        if (!rsp[10][1])
            anon = rsp;
    } catch { }
    return anon;
}

const AT_BUF = Buffer.from([0, 1, 0, 0, 0]);
const BUF1 = Buffer.from([1]);
const BUF2 = Buffer.alloc(2);
const FACE_OLD_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xCC, 0xF5, 0xD0]);

class Builder {
    elems = [];
    ptts = [];
    flashs = [];
    jsons = [];
    xmls = []; 
    b77 = [];
    anon;
    stat = {
        length: 0,
        at_cnt: 0,
        img_cnt: 0,
        face_cnt: 0,
        sface_cnt: 0,
        bface_cnt: 0, 
    };
    length = 0;
    tasks = [];
    imgs = [];
    nodes = [];
    reply = false;

    /**
     * @param {import("../ref").Client} c 
     * @param {Number} target 
     * @param {0|1|2} type //0私聊 1群聊 2讨论组
     */
    constructor(c, target, type) {
        this.c = c;
        this.target = target;
        this.type = type;
    }

    buildTextElem(text, attr6 = null) {
        if (text || attr6) {
            text = String(text);
            let n = 0;
            while (n < text.length) {
                let m = n + 80;
                let chunk = text.slice(n, m);
                n = m;
                if (text.length > n) {
                    // emoji切割问题
                    while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
                        chunk += text[n];
                        ++n;
                    }
                    while (EMOJI_NOT_STARTING.includes(text[n])) {
                        chunk += text[n];
                        ++n;
                        while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
                            chunk += text[n];
                            ++n;
                        }
                    }
                }
                this.elems.push({
                    1: {
                        1: chunk,
                        3: attr6
                    }
                });
            }
            this.stat.length += text.length;
        }
    }
    buildAtElem(cq) {
        let { qq, text, dummy } = cq;
        if (qq === "all") {
            var q = 0, flag = 1, display = "@全体成员";
        } else {
            var q = parseInt(qq), flag = 0, display = text ? text : ("@" + q);
            if (!text) {
                try {
                    const member = this.c.gml.get(this.target).get(q);
                    display = member.card ? member.card : member.nickname;
                    display = "@" + display;
                } catch (e) { }
            }
        }
        if (["1", "true", "yes"].includes(String(dummy)) || (!common.checkUin(q) && qq !== "all")) {
            if (!display.startsWith("@"))
                display = "@" + display;
            return this.buildTextElem(display);
        }
        const buf = Buffer.allocUnsafe(6);
        buf.writeUInt8(display.length), buf.writeUInt8(flag, 1), buf.writeUInt32BE(q, 2);
        const attr6 = Buffer.concat([AT_BUF, buf, BUF2]);
        this.buildTextElem(display, attr6);
        ++this.stat.at_cnt;
    }
    buildFaceElem(cq) {
        let { id, text } = cq;
        id = parseInt(id);
        if (id < 0 || id > 0xffff || isNaN(id))
            return this.c.logger.warn("不正确的表情ID：" + id);
        if (id <= 0xff) {
            const old = Buffer.allocUnsafe(2);
            old.writeUInt16BE(0x1441 + id);
            this.elems.push({
                2: {
                    1: id,
                    2: old,
                    11: FACE_OLD_BUF
                }
            });
            ++this.stat.face_cnt;
        } else {
            if (face.map[id])
                text = face.map[id];
            else if (!text)
                text = "/" + id;
            this.elems.push({
                53: {
                    1: 33,
                    2: {
                        1: id,
                        2: text,
                        3: text
                    },
                    3: 1
                }
            });
            ++this.stat.sface_cnt;
        }
    }
    buildSFaceElem(cq) {
        let { id, text } = cq;
        if (!text)
            text = id;
        text = "[" + text + "]";
        id = parseInt(id);
        this.elems.push({
            34: {
                1: id,
                2: 1,
            }
        });
        ++this.stat.sface_cnt;
        this.buildTextElem(text);
    }
    buildBFaceElem(cq) {
        try {
            var { file, text } = cq;
            if (!text) text = "原创表情";
            text = "[" + String(text).slice(0, 5) + "]";
            const o = {
                1: text,
                2: 6,
                3: 1,
                4: Buffer.from(file.slice(0, 32), "hex"),
                5: parseInt(file.slice(64)),
                6: 3,
                7: Buffer.from(file.slice(32, 64), "hex"),
                9: 0,
                10: 200,
                11: 200,
            };
            if (cq.magic && cq.magic instanceof Buffer)
                o[12] = cq.magic;
            this.elems.push({ 6: o });
            ++this.stat.bface_cnt;
            this.buildTextElem(text);
        } catch {
            this.c.logger.warn("不正确的原创表情(bface)file: " + file);
        }
    }
    buildMagicFaceElem(type, cq) {
        const rand = (a, b) => Math.floor(Math.random() * (b - a) + a);
        if (type === "dice") {
            cq.text = "骰子";
            const id = (cq.id >= 1 && cq.id <= 6) ? (cq.id - 1) : rand(0, 6);
            cq.magic = Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]);
            cq.file = "4823d3adb15df08014ce5d6796b76ee13430396532613639623136393138663911464";
            return this.buildBFaceElem(cq);
        }
        if (type === "rps") {
            cq.text = "猜拳";
            const id = (cq.id >= 1 && cq.id <= 3) ? (cq.id - 1) : rand(0, 3);
            cq.magic = Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]);
            cq.file = "83c8a293ae65ca140f348120a77448ee3764653339666562636634356536646211415";
            return this.buildBFaceElem(cq);
        }
    }

    async buildImageElem(cq) {
        const img = new ImageBuilder(this.c, !this.type);
        await img.buildNested(cq);
        if (!img.nested)
            return;

        if (cq.type === "flash") {
            const elem = {
                53: {
                    1: 3,
                    2: this.type ? { 1: img.nested } : { 2: img.nested },
                    3: 0,
                }
            };
            this.flashs.push([
                elem,
                {
                    1: {
                        1: "[闪照]请使用新版手机QQ查看闪照。"
                    }
                }
            ]);
        } else {
            const elem = this.type ? { 8: img.nested } : { 4: img.nested };
            ++this.stat.img_cnt;
            this.elems.push(elem);
        }
        if (img.task)
            this.tasks.push(img.task);
        if (!img.fid)
            this.imgs.push(img);
    }

    async buildPttElem(cq) {
        try {
            const elem = await genPttElem.call(this.c, this.type == 1 ? this.target : 1, cq);
            this.ptts.push(elem);
        } catch(e) {
            this.c.logger.warn(e);
        }
    }

    buildVideoElem(cq) {
        let file = String(cq.file);
        if (!file.startsWith("protobuf://")) {
            return this.c.logger.warn("尚未支持的file类型：" + file);
        }
        this.elems.push({
            19: Buffer.from(file.replace("protobuf://", ""), "base64")
        });
        this.stat.length++;
    }

    buildLocationElem(cq) {
        let { address, lat, lng, name, id, lon, title, content } = cq;
        if (!lng) lng = lon;
        if (!address) address = title;
        if (!name) name = content;
        if (!address || !lat || !lng) {
            return this.c.logger.warn("位置分享需要address和lat和lng");
        }
        name = name ? name : "位置分享";
        let obj = {
            config: { forward: true, type: "card", autosize: true },
            prompt: "[应用]地图",
            from: 1,
            app: "com.tencent.map",
            ver: "1.0.3.5",
            view: "LocationShare",
            meta: {
                "Location.Search": {
                    from: "plusPanel",
                    id: id ? id : "",
                    lat, lng, name, address
                }
            },
            desc: "地图"
        };
        this.buildJsonElem(obj, "收到[[应用]地图]消息，请升级QQ版本查看");
    }

    async buildMusicElem(cq) {
        const { type, id } = cq;
        try {
            const buf = await music.build(this.target, type, id, this.type);
            this.b77.push(buf);
        } catch (e) {
            this.c.logger.debug(e);
            this.c.logger.warn(`音乐获取失败：type=${type},id=${id}`);
        }
    }

    buildShareElem(cq) {
        let { url, title, content, image } = cq;
        if (!url || !title) {
            return this.c.logger.warn("分享需要title和url");
        }
        if (title.length > 26)
            title = title.substr(0, 25) + "…";
        title = escapeXml(title);
        const xml = `<?xml version="1.0" encoding="utf-8"?>
        <msg templateID="12345" action="web" brief="[分享] ${title}" serviceID="1" sourceName="QQ浏览器" url="${escapeXml(url)}"><item layout="2">${image ? `<picture cover="${escapeXml(image)}"/>` : ""}<title>${title}</title><summary>${content ? escapeXml(content) : title}</summary></item><source action="app" name="QQ浏览器" icon="http://url.cn/PWkhNu" i_actionData="tencent100446242://" a_actionData="com.tencent.mtt" appid="100446242" url="http://url.cn/UQoBHn"/></msg>`;
        this.buildXmlElem(xml, 1, url);
    }

    buildJsonElem(obj, text) {
        if (typeof obj !== "string")
            obj = JSON.stringify(obj);
        const elems = [{
            51: {
                1: Buffer.concat([BUF1, zlib.deflateSync(obj)])
            }
        }];
        if (text) {
            elems.push({
                1: {
                    1: String(text),
                }
            });
        }
        this.jsons.push(elems);
    }
    buildXmlElem(xml, svcid, text) {
        svcid = parseInt(svcid);
        const elems = [{
            12: {
                1: Buffer.concat([BUF1, zlib.deflateSync(String(xml))]),
                2: svcid > 0 ? svcid : 60,
            }
        }];
        if (text) {
            elems.push({
                1: {
                    1: String(text),
                }
            });
        }
        this.xmls.push(elems);
    }

    async buildAnonElem(cq) {
        if (this.anon !== undefined)
            return;
        if (this.type !== 1) {
            this.anon = null;
            return this.c.logger.warn("非群消息无法匿名");
        }
        const { ignore } = cq;
        const rsp = await getAnonInfo.call(this.c, this.target);
        if (!rsp) {
            if (["0", "false", "no"].includes(String(ignore))) {
                this.c.logger.warn("匿名失败，终止发送");
                throw new Error("匿名失败，终止发送");
            }
            this.c.logger.warn("匿名失败，继续发送");
            this.anon = null;
            return;
        }
        this.anon = pb.encode({
            21: {
                1: 2,
                3: rsp[3].raw,
                4: rsp[4],
                5: rsp[6],
                6: rsp[5],
            }
        });
    }

    async buildReplyElem(cq) {
        if (this.reply)
            return;
        var { id } = cq;
        var source = [{
            1: {
                1: "[消息]"
            }
        }];
        try {
            if (this.type)
                var { user_id, seq, random, time } = parseGroupMessageId(id);
            else
                var { user_id, seq, random, time } = parseC2CMessageId(id);
        } catch {
            return this.c.logger.warn("incorrect reply id: " + id);
        }
        try {
            var msg = await (this.type ? getOneGroupMsg : getOneC2CMsg).call(this.c, id);
            source = msg[3][1][2];
            if (Array.isArray(source)) {
                const bufs = [];
                for (let v of source)
                    bufs.push(v.raw);
                source = Buffer.concat(bufs);
            } else {
                source = source.raw;
            }
        } catch {
            return this.c.logger.warn("incorrect reply id: " + id);
        }
        this.elems.unshift({
            45: {
                1: [seq],
                2: user_id,
                3: time,
                4: 1,
                5: source,
                6: 0,
                8: {
                    3: genMessageUuid(random)
                },
                10: this.type ? common.code2uin(this.target) : this.c.uin
            }
        });
        this.reply = true;
    }

    buildShakeElem() {
        this.elems.push({
            17: {
                1: 0,
                2: 0,
                3: this.target,
            }
        });
        ++this.stat.length;
    }
    buildPokeElem(cq) {
        let { type } = cq;
        type = parseInt(type);
        if (!(type >= 0 && type <= 6))
            return this.c.logger.warn("不正确的poke type (只支持0-6)");
        const nested = {
            3: 0,
            7: 0,
            10: 0,
        };
        this.elems.push({
            53: {
                1: 2,
                2: nested,
                3: type,
            }
        });
        ++this.stat.length;
    }

    buildNodeElem(cq) {
        const { id } = cq;
        const task = (async () => {
            try {
                this.nodes.push(null);
                const index = this.nodes.length - 1;
                const msg = await (id.length > 24 ? getOneGroupMsg : getOneC2CMsg).call(this.c, id);
                this.nodes[index] = msg.raw;
            } catch {
                this.c.logger.warn("获取消息节点失败，message_id: " + id);
            }
        })();
        this.tasks.push(task);
    }

    /**
     * @param {import("../../client").MessageElem} 
     */
    async buildElem(type, data) {
        if (!data)
            data = { };
        switch (type) {
        case "text":
            this.buildTextElem(data.text);
            break;
        case "at":
            this.buildAtElem(data);
            break;
        case "face":
            this.buildFaceElem(data);
            break;
        case "sface":
            this.buildSFaceElem(data);
            break;
        case "bface":
            this.buildBFaceElem(data);
            break;
        case "dice":
        case "rps":
            this.buildMagicFaceElem(type, data);
            break;
        case "image":
            await this.buildImageElem(data);
            break;
        case "flash":
            data.type = "flash";
            await this.buildImageElem(data);
            break;
        case "record":
            await this.buildPttElem(data);
            break;
        case "video":
            this.buildVideoElem(data);
            break;
        case "location":
            this.buildLocationElem(data);
            break;
        case "music":
            await this.buildMusicElem(data);
            break;
        case "share":
            this.buildShareElem(data);
            break;
        case "anonymous":
            await this.buildAnonElem(data);
            break;
        case "reply":
            await this.buildReplyElem(data);
            break;
        case "shake":
            this.buildShakeElem();
            break;
        case "poke":
            this.buildPokeElem(data);
            break;
        case "json":
            if (data.data)
                this.buildJsonElem(data.data, data.text);
            break;
        case "xml":
            if (data.data)
                this.buildXmlElem(data.data, data.type, data.text);
            break;
        case "node":
            this.buildNodeElem(data);
            break;
        default:
            this.c.logger.warn("未知的元素(CQ码)类型：" + type);
            break;
        }
    }

    /**
     * @param {import("../../client").MessageElem[]|String} message 
     * @param {Boolean} escape 
     */
    async buildFromString(message, escape) {
        if (escape)
            return this.buildTextElem(message);
        const res = message.matchAll(/\[CQ:[^\]]+\]/g);
        let prev_index = 0;
        for (let v of res) {
            const text = message.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
            this.buildTextElem(text);
            const element = v[0];
            let cq = element.replace("[CQ:", "cqtype=");
            cq = cq.substr(0, cq.length - 1);
            cq = qs(cq);
            await this.buildElem(cq.cqtype.trim(), cq);
            prev_index = v.index + element.length;
        }
        if (prev_index < message.length) {
            const text = message.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
            this.buildTextElem(text);
        }
    }

    /**
     * @param {import("../../client").MessageElem[]|String} message 
     * @param {Boolean} escape 
     */
    async exec(message, escape) {
        if (typeof message[Symbol.iterator] === "function" && typeof message !== "string") {
            for (let v of message) {
                if (!v || !v.type) continue;
                await this.buildElem(v.type, v.data);
            }
        } else if (message) {
            await this.buildFromString(String(message), escape);
        }
        await Promise.all(this.tasks);
        this.nodes = this.nodes.filter(v => v); // 去除空值
        await uploadImages.call(this.c, this.target, this.imgs, !this.type);
        this.length = this.stat.length +
            this.stat.at_cnt * 22 +
            this.stat.face_cnt * 23 +
            this.stat.sface_cnt * 42 +
            this.stat.bface_cnt * 135 +
            this.stat.img_cnt * (this.type ? 90 : 295);
    }
}

function qs(s, sep = ",", equal = "=") {
    const ret = {};
    const split = s.split(sep);
    for (let v of split) {
        const i = v.indexOf(equal);
        if (i === -1) continue;
        ret[v.substring(0, i)] = v.substr(i + 1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside);
    }
    return ret;
}

module.exports = {
    Builder
};
