/**
 * 构建消息节点
 * 消息发送
 */
"use strict";
const zlib = require("zlib");
const { randomBytes } = require("crypto");
const music = require("./music");
const face = require("./face");
const { getC2CMsgs, getGroupMsgs } = require("./history");
const { genPttElem } = require("./ptt");
const { ImageBuilder, uploadImages } = require("./image");
const pb = require("../pb");
const common = require("../common");
const { highwayUpload } = require("../service");
const { parseC2CMessageId, parseGroupMessageId, genMessageUuid, genC2CMessageId, genRandom } = common;
const EMOJI_NOT_ENDING = ["\uD83C", "\uD83D", "\uD83E", "\u200D"];
const EMOJI_NOT_STARTING = ["\uFE0F", "\u200D", "\u20E3"];
const PB_CONTENT = pb.encode({ 1: 1, 2: 0, 3: 0 });
const PB_RESERVER = pb.encode({
    37: {
        17: 0,
        19: {
            15: 0,
            31: 0,
            41: 0
        },
    }
});
const TYPES = {
    0: "Private", 1: "Group", 2: "Discuss"
};

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

/**
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {Buffer} compressed 
 * @returns {Promise<Buffer>} resid
 */
async function uploadMultiMsg(target, compressed) {
    const body = pb.encode({
        1: 1,
        2: 5,
        3: 9,
        4: 3,
        5: this.apk.version,
        6: [{
            1: target,
            2: compressed.length,
            3: common.md5(compressed),
            4: 3,
            5: 0,
        }],
        8: 1,
    });
    const blob = await this.sendUni("MultiMsg.ApplyUp", body);
    const rsp = pb.decode(blob)[2];
    if (rsp[1] > 0)
        throw new Error();
    const buf = pb.encode({
        1: 1,
        2: 5,
        3: 9,
        4: [{
            //1: 3,
            2: target,
            4: compressed,
            5: 2,
            6: rsp[3].raw,
        }],
    });
    const o = {
        buf: buf,
        md5: common.md5(buf),
        key: rsp[10].raw
    };
    const ip = Array.isArray(rsp[4]) ? rsp[4][0] : rsp[4],
        port = Array.isArray(rsp[5]) ? rsp[5][0] : rsp[5];
    await highwayUpload.call(this, ip, port, o, 27);
    return rsp[2].raw;
}

const AT_BUF = Buffer.from([0, 1, 0, 0, 0]);
const BUF1 = Buffer.from([1]);
const BUF2 = Buffer.alloc(2);
const FACE_OLD_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xCC, 0xF5, 0xD0]);

/**
 * @type {import("../ref")}
 */
class Builder {

    /**
     * 连续节点
     * @private
     * @type {import("../ref").RichMsg[2]}
     */
    elems = [];

    /**
     * 排他节点
     * @private
     * @type {import("../ref").RichMsg[2][]}
     */
    elems2 = [];

    /**
     * 语音节点
     * @private
     * @type {import("../ref").RichMsg[4][]}
     */
    ptts = [];

    /**
     * b77节点
     * @private
     * @type {Buffer[]}
     */
    b77s = [];

    /**
     * 匿名节点
     * @private
     * @type {Buffer}
     */
    anon = undefined;

    /**
     * 回复节点
     * @private
     * @type {Buffer}
     */
    reply = undefined;

    /**
     * 连续节点数量
     * @private
     */
    length = 0;

    /**
     * 文本长度
     * @private
     */
    size = 0;

    /**
     * 异步任务
     * @private
     * @type {Promise<void>[]}
     */
    tasks = [];

    /**
     * 未完成的图片
     * @private
     * @type {ImageBuilder[]}
     */
    imgs = [];

    /**
     * 转发节点
     * @private
     * @type {Buffer[]}
     */
    nodes = [];

    /**
     * 发送路径
     * @private
     * @type {Buffer}
     */
    routing;
    seq = 0;
    random = 0;

    /**
     * @public
     * @param {import("../ref").Client} c 
     * @param {number} target 
     * @param {0|1|2} type //0私聊 1群聊 2讨论组
     */
    constructor(c, target, type) {
        this.c = c;
        this.target = target;
        this.type = type;
    }

    /**
     * @private
     * @param {string} text 
     * @param {Buffer} attr6 
     */
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
            this.length += text.length;
        }
    }

    /**
     * @private
     * @param {import("../ref").AtElem["data"]} cq 
     */
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
    }

    /**
     * @private
     * @param {import("../ref").FaceElem["data"]} cq 
     */
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
        }
    }

    /**
     * @private
     * @param {import("../ref").FaceElem["data"]} cq 
     */
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
        this.buildTextElem(text);
    }

    /**
     * @private
     * @param {import("../ref").BfaceElem["data"]} cq 
     */
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
            this.buildTextElem(text);
        } catch {
            this.c.logger.warn("不正确的原创表情(bface)file: " + file);
        }
    }

    /**
     * @private
     * @param {import("../ref").MfaceElem["type"]} type 
     * @param {import("../ref").MfaceElem["data"]} cq 
     */
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

    /**
     * @private
     * @param {import("../ref").ImgPttElem["data"]} cq 
     */
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
            this.elems2.push([
                elem,
                {
                    1: {
                        1: "[闪照]请使用新版手机QQ查看闪照。"
                    }
                }
            ]);
        } else {
            const elem = this.type ? { 8: img.nested } : { 4: img.nested };
            this.elems.push(elem);
        }
        if (img.task)
            this.tasks.push(img.task);
        if (!img.fid)
            this.imgs.push(img);
    }

    /**
     * @private
     * @param {import("../ref").ImgPttElem["data"]} cq 
     */
    async buildPttElem(cq) {
        try {
            const elem = await genPttElem.call(this.c, this.type == 1 ? this.target : 1, cq);
            this.ptts.push(elem);
        } catch(e) {
            this.c.logger.warn(e);
        }
    }

    /**
     * @private
     * @param {import("../ref").VideoElem["data"]} cq 
     */
    buildVideoElem(cq) {
        let file = String(cq.file);
        if (!file.startsWith("protobuf://")) {
            return this.c.logger.warn("尚未支持的file类型：" + file);
        }
        this.elems2.push([{
            19: Buffer.from(file.replace("protobuf://", ""), "base64")
        }]);
    }

    /**
     * @private
     * @param {import("../ref").LocationElem["data"]} cq 
     */
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

    /**
     * @private
     * @param {import("../ref").MusicElem["data"]} cq 
     */
    async buildMusicElem(cq) {
        const { type, id } = cq;
        try {
            const buf = await music.build(this.target, type, id, this.type);
            this.b77s.push(buf);
        } catch (e) {
            this.c.logger.debug(e);
            this.c.logger.warn(`音乐获取失败：type=${type},id=${id}`);
        }
    }

    /**
     * @private
     * @param {import("../ref").ShareElem["data"]} cq 
     */
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

    /**
     * @private
     * @param {any} obj 
     * @param {string} text 
     */
    buildJsonElem(obj, text = "") {
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
        this.elems2.push(elems);
    }

    /**
     * @private
     * @param {string} xml 
     * @param {number} svcid 
     * @param {string} text 
     */
    buildXmlElem(xml, svcid = 60, text = "") {
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
        this.elems2.push(elems);
    }

    /**
     * @private
     * @param {import("../ref").AnonymousElem["data"]} cq 
     */
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

    /**
     * @private
     * @param {import("../ref").ReplyElem["data"]} cq 
     */
    async buildReplyElem(cq) {
        if (this.reply)
            return;
        try {
            const { user_id, seq, random, time, msg, flag } = await this.getMsg(cq.id);
            let source = msg[3][1][2];
            if (Array.isArray(source)) {
                const bufs = [];
                for (let v of source)
                    bufs.push(v.raw);
                source = Buffer.concat(bufs);
            } else {
                source = source.raw;
            }
            this.reply = pb.encode({
                45: {
                    1: [seq],
                    2: flag ? this.c.uin : user_id,
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
        } catch {
            return this.c.logger.warn("incorrect reply id: " + cq.id);
        }
    }

    /**
     * @private
     */
    buildShakeElem() {
        this.elems2.push([{
            17: {
                1: 0,
                2: 0,
                3: this.target,
            }
        }]);
    }

    /**
     * @private
     * @param {import("../ref").PokeElem["data"]} cq 
     */
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
        this.elems2.push([{
            53: {
                1: 2,
                2: nested,
                3: type,
            }
        }]);
    }

    /**
     * @private
     * @param {import("../ref").NodeElem["data"]} cq 
     */
    buildNodeElem(cq) {
        const task = (async () => {
            try {
                this.nodes.push(null);
                const index = this.nodes.length - 1;
                const { msg } = await this.getMsg(cq.id);
                this.nodes[index] = msg.raw;
            } catch {
                this.c.logger.warn("获取消息节点失败，message_id: " + cq.id);
            }
        })();
        this.tasks.push(task);
    }

    /**
     * @private
     * @param {string} id 
     */
    async getMsg(id) {
        if (id.length > 24) {
            const { group_id ,user_id, seq, random, time } = parseGroupMessageId(id);
            const msgs = await getGroupMsgs.call(this.c, group_id, seq, seq);
            return { user_id, seq, random, time, msg: msgs[0] };
        } else {
            const { user_id, seq, random, time, flag } = parseC2CMessageId(id);
            const msgs = await getC2CMsgs.call(this.c, user_id, time + 1, 1);
            if (genRandom(msgs[0][1][7]) !== random)
                throw new Error();
            return { user_id, seq, random, time, msg: msgs[0], flag };
        }
    }

    /**
     * @private
     * @param {import("../ref").MessageElem["type"]} type 
     * @param {import("../ref").MessageElem["data"]} data 
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
     * @private
     * @param {string} message 
     * @param {boolean} escape 
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
     * @public
     * @param {import("../ref").MessageElem[]|string} message 
     * @param {boolean} escape 
     */
    async buildAndSend(message, escape) {
        
        if (typeof message[Symbol.iterator] === "function" && typeof message !== "string") {
            for (let v of message) {
                if (!v || !v.type) continue;
                await this.buildElem(v.type, v.data);
            }
        } else if (typeof message === "object" && message !== null && message.type) {
            await this.buildElem(message.type, message.data);
        } else if (message) {
            await this.buildFromString(String(message), escape);
        }
        await Promise.all(this.tasks);
        this.nodes = this.nodes.filter(v => v); // 去除空值
        await uploadImages.call(this.c, this.target, this.imgs, !this.type);
        
        await this.setRouting();

        const tasks = [];
        for (let buf of this.b77s) {
            tasks.push(this.sendB77(buf));
        }

        for (let ptt of this.ptts) {
            tasks.push(this.send({ 2: [], 4: ptt }));
        }

        for (let elems of this.elems2) {
            tasks.push(this.send({ 2: elems }));
        }

        if (this.nodes.length > 0) {
            const elems = await this.toForwardMsgElems();
            tasks.push(this.send({ 2: elems })); 
        }

        if (tasks.length > 0)
            var rsp = await Promise.race(tasks);

        if (!this.elems.length) {
            if (rsp) return rsp;
            throw new Error("empty message");
        }
        if (this.reply)
            this.elems.unshift(this.reply);
        return await this.send({ 2: this.elems }, true);
    }

    /**
     * @private
     */
    async setRouting() {
        if (this.routing) {
            return;
        }
        let routing;
        if (this.type > 0) {
            routing = this.type === 1 ? { 2: { 1: this.target } } : { 4: { 1: this.target } };
        } else {
            let user_id = this.target;
            routing = { 1: { 1: user_id } };
            if (this.c.sl.has(user_id)) {
                try {
                    const group_id = this.c.sl.get(user_id).group_id;
                    if (group_id && (await this.c.getGroupMemberInfo(group_id, user_id)).data)
                        routing = {
                            3: {
                                1: common.code2uin(group_id),
                                2: user_id,
                            }
                        };
                } catch (e) { }
            } else if (!this.c.fl.has(user_id)) {
                for (const [k, v] of this.c.gml) {
                    if (v instanceof Map && v.has(user_id)) {
                        routing = {
                            3: {
                                1: common.code2uin(k),
                                2: user_id,
                            }
                        };
                        break;
                    }
                }
            }
        }
        this.routing = pb.encode(routing);
    }

    /**
     * @private
     * @param {import("../ref").RichMsg} rich 
     * @param {Buffer} content 
     * @param {number} random 
     */
    buildPbSendMsgPkt(rich, content = PB_CONTENT, random = undefined) {
        this.seq = this.c.seq_id + 1;
        this.random = random === undefined ? randomBytes(4).readUInt32BE() : random;
        if (this.anon)
            rich[2].push(this.anon);
        rich[2].push(PB_RESERVER);
        return pb.encode({
            1: this.routing,
            2: content,
            3: { 1: rich },
            4: this.seq,
            5: this.random,
            6: this.type > 0 ? null : this.c.buildSyncCookie(),
            8: 0
        });
    }

    /**
     * @private
     * @param {import("../ref").RichMsg} rich 
     * @param {boolean} flag 
     */
    async send(rich, flag = false) {
        ++this.c.stat.sent_msg_cnt;
        const body = this.buildPbSendMsgPkt(rich);
        const event_id = `interval.${this.target}.${this.random}`;
        let message_id = "";
        this.c.once(event_id, (id) => message_id = id);
        try {
            var blob = await this.c.sendUni("MessageSvc.PbSendMsg", body);
        } finally {
            this.c.removeAllListeners(event_id);
        }
        const rsp = pb.decode(blob);
        const retcode = rsp[1];
        if (retcode !== 0) {
            let emsg = rsp[2] ? String(rsp[2].raw) : "";
            this.c.logger.error(`send failed: [${TYPES[this.type]}: ${this.target}] ${emsg}(${retcode})`);
            return { result: retcode, emsg };
        }
        if (retcode === 0) {
            if (this.type === 0) { //私聊
                message_id = genC2CMessageId(this.target, this.seq, this.random, rsp[3], 1);
            }
            if (this.type === 1 && !message_id) { //群聊
                message_id = await this.waitForMessageId(this.c.config.resend ? 500 : 5000);
                if (!message_id) {
                    if (this.length <= 80) {
                        const emsg = "群消息可能发送失败，请检查消息内容。";
                        this.c.logger.error(`send failed: [Group: ${this.target}] ` + emsg);
                        return { result: -1, emsg };
                    }
                    if (flag && this.c.config.resend) {
                        this.c.logger.warn("群消息被风控，将尝试使用分片发送。");
                        return await this.sendByFrag();
                    } else {
                        const emsg = "群消息被风控，发送失败。";
                        this.c.logger.error(`send failed: [Group: ${this.target}] ` + emsg);
                        return { result: -1, emsg };
                    }
                }
            }
            this.c.logger.info(`send to: [${TYPES[this.type]}: ${this.target} / message_id: ${message_id}]`);
            return { result: 0, data: { message_id } };
        }
    }

    /**
     * @private
     */
    async sendByFrag() {
        this.elems.pop();

        const fragments = [];
        let fragment = [];
        for (let elem of this.elems) {
            fragment.push(elem);
            if (elem[1] && !elem[1][3]) { //1:text 1[3]:at
                fragment.push(PB_RESERVER);
                fragments.push(fragment);
                fragment = [];
            }
        }
        if (fragment.length > 0) {
            fragment.push(PB_RESERVER);
            fragments.push(fragment);
        }

        let n = 0;
        const random = randomBytes(4).readUInt32BE();
        const div = randomBytes(2).readUInt16BE();
        for (let fragment of fragments) {
            const content = pb.encode({
                1: fragments.length,
                2: n++,
                3: div
            });
            const body = this.buildPbSendMsgPkt({ 2: fragment }, content, random);
            this.c.writeUni("MessageSvc.PbSendMsg", body);
        }
        let message_id = await this.waitForMessageId(5000);
        if (!message_id) {
            const emsg = "群分片消息可能发送失败，请检查消息内容。";
            this.c.logger.error(`send failed: [Group: ${this.target}] ` + emsg);
            return { result: -1, emsg };
        } else {
            this.c.logger.info(`send to: [Group: ${this.target} / message_id: ${message_id}]`);
            return { result: 0, data: { message_id } };
        }
    }

    /**
     * @private
     * @param {number} time 
     * @returns {Promise<string>} message_id
     */
    waitForMessageId(time) {
        const event_id = `interval.${this.target}.${this.random}`;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.c.removeAllListeners(event_id);
                resolve("");
            }, time);
            this.c.once(event_id, (id) => {
                clearTimeout(timeout);
                resolve(id);
            });
        });
    }

    /**
     * @private
     * @param {Buffer} buf 
     */
    async sendB77(buf) {
        ++this.c.stat.sent_msg_cnt;
        await this.c.sendOidb("OidbSvc.0xb77_9", buf);
        return { result: 0, data: { message_id: "" } };
    }

    /**
     * @private
     * @returns {Promise<import("../ref").RichMsg[2]>}
     */
    async toForwardMsgElems() {
        const compressed = zlib.gzipSync(pb.encode({
            1: this.nodes,
            2: {
                1: "MultiMsg",
                2: {
                    1: this.nodes
                }
            }
        }));
        try {
            var resid = await uploadMultiMsg.call(this.c, this.target, compressed);
        } catch (e) {
            throw new Error("failed to upload forward msg");
        }
        const preview = " <title color=\"#000000\" size=\"26\" > 转发的聊天记录 </title>";
        const template = `<?xml version="1.0" encoding="utf-8"?>
        <msg brief="[聊天记录]" m_fileName="${common.uuid().toUpperCase()}" action="viewMultiMsg" tSum="2" flag="3" m_resid="${resid}" serviceID="35" m_fileSize="${compressed.length}"  > <item layout="1"> <title color="#000000" size="34" > 转发的聊天记录 </title>${preview}  <hr></hr> <summary color="#808080" size="26" > 查看${this.nodes.length}条转发消息  </summary> </item><source name="聊天记录"></source> </msg>`;
        return [
            {
                12: {
                    1: Buffer.concat([BUF1, zlib.deflateSync(template)]),
                    2: 35,
                },
            },
        ];
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
