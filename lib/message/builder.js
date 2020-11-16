"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const {randomBytes} = require("crypto");
const spawn = require("child_process");
const music = require("./music");
const face = require("./face");
const {downloadWebImage, downloadWebRecord, readFile} = require("../service");
const {uploadPtt, uploadImages, setPrivateImageNested, setGroupImageNested, getAnonInfo} = require("./storage");
const common = require("../common");
const {parseC2CMessageId, parseGroupMessageId} = common;

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

const AT_BUF = Buffer.from([0,1,0,0,0]);
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
    is_forward = false;
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
            this.elems.push({
                1: {
                    1: text,
                    3: attr6
                }
            });
            this.stat.length += Buffer.byteLength(text);
        }
    }
    buildAtElem(cq) {
        let {qq, text, dummy} = cq;
        if (qq === "all") {
            var q = 0, flag = 1, display = "@全体成员";
        } else {
            var q = parseInt(qq), flag = 0, display = text ? text : ("@" + q);
            if (!text) {
                try {
                    const member = this.c.gml.get(this.target).get(q);
                    display = member.card ? member.card : member.nickname;
                } catch (e) {}
            }
        }
        if (dummy == "1" || (!common.checkUin(q) && qq !== "all")) {
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
        let {id, text} = cq;
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
    buildBFaceElem(cq) {
        try {
            let {file, text} = cq;
            if (!text) text = "原创表情";
            text = "["+text.slice(0, 5)+"]";
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
            this.elems.push({6: o});
            ++this.stat.bface_cnt;
            this.buildTextElem(text);
        } catch {}
    }
    buildMagicFaceElem(type, cq) {
        const rand = (a,b)=>Math.floor(Math.random()*(b-a)+a);
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
        let {file, url, cache, type, timeout, proxy} = cq;
        if (!file) return;
        let fid, buf, md5 = randomBytes(16), size = 65536;
        const nested = {}; //pb nested obj
        if (type === "flash") {
            var elem = this.type ? {1:nested} : {2:nested};
            elem = {
                53: {
                    1: 3,
                    2: elem,
                    3: 0,
                }
            };
        } else {
            type = "image";
            var elem = this.type ? {8:nested} : {4:nested};
        }
        const img = {
            buf, md5, size, nested
        };

        // bytes
        if (file instanceof Buffer || file instanceof Uint8Array) {
            buf = file, md5 = common.md5(file), size = file.length;
        }
        
        // 网络图片
        else if (file.startsWith("http://") || file.startsWith("https://")) {
            const filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
            const filepath = path.join(this.c.dir, "..", "image", filename);
            try {
                if (cache == "0")
                    throw new Error("no cache");
                const content = await fs.promises.readFile(filepath, "utf8");
                md5 = Buffer.from(content.slice(0, 32), "hex"), size = parseInt(content.slice(32));
                if (md5.length !== 16 || size > 0 === false) {
                    fs.unlink(filepath, ()=>{});
                    throw new Error("bad file");
                }
            } catch {
                const task = (async()=>{
                    try {
                        var buf = await downloadWebImage(file, proxy=="1", timeout);
                    } catch (e) {
                        this.c.logger.warn(`下载网络图片失败 ${file} 失败。`);
                        return this.c.logger.warn(e);
                    }
                    img.buf = buf;
                    img.size = buf.length;
                    img.md5 = common.md5(buf);
                    fs.writeFile(filepath, img.md5.toString("hex") + img.size, ()=>{});
                })();
                this.tasks.push(task);
            }
        }
    
        // base64图片
        else if (file.startsWith("base64://")) {
            file = file.trim().replace("base64://", "");
            buf = Buffer.from(file, "base64");
            md5 = common.md5(buf), size = buf.length;
        }
    
        else {
            md5 = Buffer.from(file.slice(0, 32), "hex");
            //本地图片
            if (md5.length !== 16) {
                try {
                    file = file.trim().replace(/^file:\/{2,3}/, "");
                    buf = await readFile(file);
                    md5 = common.md5(buf), size = buf.length;
                } catch (e) {
                    this.c.logger.warn(`获取本地图片 ${file} 失败。`);
                    return this.c.logger.warn(e);
                }
            }
            //只有md5和size
            else {
                size = parseInt(file.substr(32));
                size = size > 0 ? size : 0;
            }
        }
    
        img.buf = buf;
        img.size = size;
        img.md5 = md5;
    
        //有url参数的图片可以直接取得fid
        if (this.type && url && url.includes("gchatpic_new")) {
            const id = url.match(/-[0-9]+-/);
            if (id)
                fid = parseInt(id[0].replace("-", "")) - 0xffffffff;
        }
        if (!this.type && url && url.includes("offpic_new")) {
            const id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
            if (id)
                fid = id[0].replace("/", "");
        }
    
        if (fid)
            (this.type?setGroupImageNested:setPrivateImageNested).call(this.c, img, fid);
        else
            this.imgs.push(img);
        if (type === "flash") {
            this.flashs.push([
                elem,
                {
                    1: {
                        1: "[闪照]请使用新版手机QQ查看闪照。"
                    }
                }
            ]);
        } else {
            ++this.stat.img_cnt;
            this.elems.push(elem);
        }
    }

    async buildPttElem(cq) {
        let {file, cache, timeout, proxy} = cq;
        if (!file) return;
        let buf, md5, size, codec, url;
        try {
            file = file.trim();
            file = file.replace(/^file:\/{2,3}/, "");
            url = file;
            const cache_filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
            const cache_filepath = path.join(this.c.dir, "..", "record", cache_filename);
            if (cache != "0") {
                try {
                    buf = await fs.promises.readFile(cache_filepath);
                } catch (e) {}
            }
            if (!buf) {
                if (file.startsWith("http://") || file.startsWith("https://"))
                    file = await downloadWebRecord(file, proxy=="1", timeout);
                else if (file.startsWith("base64://"))
                    file = Buffer.from(file.replace("base64://", ""), "base64");
                buf = await audioTrans.call(this.c, cache_filepath, file);
            }
            const head = buf.slice(0, 7).toString();
            codec = head.includes("SILK") ? 1 : 0;
        } catch (e) {
            this.c.logger.warn(`音频文件 ${url} 处理失败。`);
            return this.c.logger.debug(e);
        }
        md5 = common.md5(buf), size = buf.length;
        try {
            const target = this.type === 1 ? this.target : 1;
            var fid = await uploadPtt.call(this.c, target, buf, md5, codec);
        } catch(e) {
            this.c.logger.debug(e);
            return this.c.logger.debug("语音上传失败");
        }
        const elem = {
            1: 4,
            2: this.c.uin,
            3: fid,
            4: md5,
            5: md5.toString("hex") + ".amr",
            6: size,
            11: 1,
            18: fid,
            30: Buffer.from([8, 0, 40, 0, 56, 0]),
        };
        this.ptts.push(elem);
    }

    buildLocationElem(cq) {
        let {address, lat, lng, name, id} = cq;
        if (!address || !lat || !lng) return;
        name = name ? name : "位置分享";
        let obj = {
            config: { forward: true, type: 'card', autosize: true },
            prompt: '[应用]地图',
            from: 1,
            app: 'com.tencent.map',
            ver: '1.0.3.5',
            view: 'LocationShare',
            meta: {
                'Location.Search': {
                    from: 'plusPanel',
                    id: id?id:"",
                    lat, lng, name, address
                }
            },
            desc: '地图'
        };
        this.buildJsonElem(obj, "收到[[应用]地图]消息，请升级QQ版本查看");
    }

    async buildMusicElem(cq) {
        const {type, id} = cq;
        try {
            const buf = await music.build(this.target, type, id, this.type);
            this.b77.push(buf);
        } catch (e) {
            // console.log(e)
            this.c.logger.warn(`音乐获取失败：type=${type},id=${id}`);
        }
    }

    buildShareElem(cq) {
        let {url, title, content, image} = cq;
        if (!url || !title)
            return;
        if (title.length > 26)
            title = title.substr(0, 25) + "…";
        title = common.escapeXml(title);
        const xml = `<?xml version="1.0" encoding="utf-8"?>
        <msg templateID="12345" action="web" brief="[分享] ${title}" serviceID="1" sourceName="QQ浏览器" url="${common.escapeXml(url)}"><item layout="2">${image?`<picture cover="${common.escapeXml(image)}"/>`:""}<title>${title}</title><summary>${content?common.escapeXml(content):title}</summary></item><source action="app" name="QQ浏览器" icon="http://url.cn/PWkhNu" i_actionData="tencent100446242://" a_actionData="com.tencent.mtt" appid="100446242" url="http://url.cn/UQoBHn"/></msg>`;
        this.buildXmlElem(xml, 1, url);
    }

    buildJsonElem(obj, text) {
        const elems = [{
            51: {
                1: Buffer.concat([BUF1, zlib.deflateSync(JSON.stringify(obj))])
            }
        }];
        if (text) {
            elems.push({
                1: {
                    1: String(text),
                }
            })
        }
        this.jsons.push(elems);
    }
    buildXmlElem(xml, svcid, text) {
        const elems = [{
            12: {
                1: Buffer.concat([BUF1, zlib.deflateSync(String(xml))]),
                2: svcid,
            }
        }];
        if (text) {
            elems.push({
                1: {
                    1: String(text),
                }
            })
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
        const {ignore} = cq;
        const rsp = await getAnonInfo.call(this.c, this.target);
        if (!rsp) {
            if (ignore === "0") {
                this.c.logger.warn("匿名失败，终止发送。");
                throw new Error("匿名失败，终止发送。");
            }
            this.c.logger.warn("匿名失败，继续发送。");
            this.anon = null;
        }
        this.anon = {
            21: {
                1: 2,
                3: rsp[3].raw,
                4: rsp[4],
                5: rsp[6],
                6: rsp[5],
            }
        };
    }

    buildReplyElem(cq) {
        if (this.reply)
            return;
        var {id} = cq;
        try {
            if (this.type)
                var {user_id, seq, random, time} = parseGroupMessageId(id);
            else
                var {user_id, seq, random, time} = parseC2CMessageId(id);
        } catch {
            return;
        }
        this.elems.unshift({
            45: {
                1: [seq],
                2: user_id,
                3: time,
                4: 1,
                5: [{
                    1: {
                        1: "[消息]"
                    }
                }],
                6: this.type,
                8: {
                    3: 0x01000000n<<32n|BigInt(random&0xffffffff)
                },
                10: this.type ? common.code2uin(this.target) : this.c.uin
            }
        });
        this.reply = true;
    }

    buildGeneralFlagsElem() {
        this.elems.push({
            37: {
                17: 0,
                19: {
                    15: 0,
                    31: 0,
                    41: 0
                },
            }
        });
    }

    /**
     * @param {import("../../client").MessageElem} 
     */
    async buildElem(type, data) {
        switch (type) {
            case "text":
                this.buildTextElem(data.text);
                break;
            case "at":
                this.buildAtElem(data);
                break;
            case "face":
            case "sface":
                this.buildFaceElem(data);
                break;
            case "bface":
                this.buildBFaceElem(data);
                break;
            case "dice":
            case "rps":
                this.buildMagicFaceElem(type, data)
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
                await this.buildAnonElem(data)
                break;
            case "reply":
                this.buildReplyElem(data);
                break;
            default:
                this.c.logger.warn("未知的CQ码类型：" + type);
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
        await uploadImages.call(this.c, this.target, this.imgs, this.type);
        this.buildGeneralFlagsElem();
        this.length = this.stat.length + 
            this.stat.at_cnt * 22 +
            this.stat.face_cnt * 23 +
            this.stat.sface_cnt * 42 +
            this.stat.bface_cnt * 135 +
            this.stat.img_cnt * (this.type?90:295);
        this.length *= 1.05;
    }

    isLong() {
        return this.type ? (this.length>790) : (this.length>935);
    }
}

function qs(s, sep = ",", equal = "=") {
    const ret = {};
    const split = s.split(sep);
    for (let v of split) {
        const i = v.indexOf(equal);
        if (i === -1) continue;
        ret[v.substring(0, i)] = v.substr(i+1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside);;
    }
    return ret;
}

/**
 * @this {import("../ref").Client}
 * @param {String} cache_filepath 
 * @param {Buffer|String} file 
 * @returns {Buffer}
 */
async function audioTrans(cache_filepath, file) {
    let filepath, tmp;
    if (typeof file === "string") {
        filepath = file;
        file = await readFile(filepath, 0xfffffff);
    } else {
        tmp = Math.random() + "" + Date.now();
        filepath = path.join(path.dirname(cache_filepath), tmp);
        await fs.promises.writeFile(filepath, file);
    }
    const head = file.slice(0, 7).toString();
    if (head.includes("SILK") || head.includes("AMR")) {
        if (tmp)
            fs.rename(filepath, cache_filepath, ()=>{})
        return file;
    }
    return new Promise((resolve, reject)=>{
        spawn.exec(`ffmpeg -y -i ${filepath} -ac 1 -ar 8000 -f amr ${cache_filepath}`, async(error, stdout, stderr)=>{
            this.logger.debug("ffmpeg error: " + error);
            this.logger.debug("ffmpeg output: " + stdout + stderr);
            if (tmp)
                fs.unlink(filepath, ()=>{});
            try {
                const amr = await fs.promises.readFile(cache_filepath);
                this.logger.info(`ffmpeg成功转换了一个音频。`);
                resolve(amr);
            } catch (e) {
                this.logger.warn(`音频转码到amr失败，请确认你的ffmpeg可以处理此转换。`);
                reject();
            }
        })
    })
}

module.exports = Builder;
