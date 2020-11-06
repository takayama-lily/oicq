"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const spawn = require("child_process");
const {downloadWebImage, downloadWebRecord} = require("../service");
const {uploadPtt, uploadImages, setPrivateImageNested, setGroupImageNested, getAnonInfo} = require("./storage");
const common = require("../common");

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

/**
 * @param {Map} chain 
 * @param {String} text 
 * @returns {Number} text byte length
 */
function buildTextMessage(chain, text) {
    if (!text) return 0;
    text = String(text);
    chain.set({1: {1: text}}, {type: "text"});
    return Buffer.byteLength(text);
}

/**
 * @returns {Number} display byte length
 */
function buildAtMessage(chain, cq, group_id) {
    let {qq, text} = cq;
    if (qq === "all") {
        var q = 0, flag = 1, display = "@全体成员";
    } else {
        var q = parseInt(qq), flag = 0, display = text ? text : ("@" + q);
        if (!text) {
            try {
                const member = this.gml.get(group_id).get(q);
                display = member.card ? member.card : member.nickname;
            } catch (e) {}
        }
    }
    if (!common.checkUin(q) && qq !== "all")
        return 0;
    const buf = Buffer.allocUnsafe(6);
    buf.writeUInt8(display.length), buf.writeUInt8(flag, 1), buf.writeUInt32BE(q, 2);
    chain.set({1: {
        1: display,
        3: Buffer.concat([AT_BUF, buf, BUF2])
    }}, {type: "at"});
    return Buffer.byteLength(display);
}

/**
 * @returns {Boolean} success?
 */
function buildFaceMessage(chain, cq) {
    let {id} = cq;
    id = parseInt(id);
    if (id < 0 || id > 0xff || isNaN(id)) return false;
    const old = Buffer.allocUnsafe(2);
    old.writeUInt16BE(0x1441 + id);
    chain.set({2: {
        1: id,
        2: old,
        11: FACE_OLD_BUF
    }}, {type: "face"});
    return true;
}

/**
 * @returns {Boolean} success?
 */
function buildSFaceMessage(chain, cq) {
    let {id, text} = cq;
    id = parseInt(id);
    if (id < 0 || isNaN(id)) return false;
    if (!text) text = "/" + id;
    chain.set({53: {
        1: 33,
        2: {
            1: id,
            2: text,
            3: text
        },
        3: 1
    }}, {type: "sface"});
    return true;
}

/**
 * @returns {Boolean} success?
 */
function buildBFaceMessage(chain, cq) {
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
        chain.set({6: o}, {type: "bface"});
        chain.set({1: {
            1: text,
        }}, {type: "text"});
        return true;
    } catch (e) {
        return false;
    }
}
function buildMagicFaceMessage(chain, type, cq) {
    const rand = (a,b)=>Math.floor(Math.random()*(b-a)+a);
    if (type === "dice") {
        cq.text = "骰子";
        const id = (cq.id >= 1 && cq.id <= 6) ? (cq.id - 1) : rand(0, 6);
        cq.magic = Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]);
        cq.file = "4823d3adb15df08014ce5d6796b76ee13430396532613639623136393138663911464";
        return buildBFaceMessage(chain, cq);
    }
    if (type === "rps") {
        cq.text = "猜拳";
        const id = (cq.id >= 1 && cq.id <= 3) ? (cq.id - 1) : rand(0, 3);
        cq.magic = Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]);
        cq.file = "83c8a293ae65ca140f348120a77448ee3764653339666562636634356536646211415";
        return buildBFaceMessage(chain, cq);
    }
    return false;
}

/**
 * @returns {Boolean}
 */
async function buildImageMessage(chain, cq, is_group, stat) {
    let {file, url, cache, type, timeout, proxy} = cq;
    if (!file) return false;
    file = file.trim();
    let fid, buf, md5 = crypto.randomBytes(16), size = 65536;
    const nested = {}; //pb nested obj
    if (type === "flash") {
        var elem = is_group ? {1:nested} : {2:nested};
        elem = {
            53: {
                1: 3,
                2: elem,
                3: 0,
            }
        };
    } else {
        type = "image";
        var elem = is_group ? {8:nested} : {4:nested};
    }
    const img = {
        buf, md5, size, nested
    };
    
    // 网络图片
    if (file.startsWith("http://") || file.startsWith("https://")) {
        const filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
        const filepath = path.join(this.dir, "..", "image", filename);
        try {
            if (cache === "0")
                throw new Error("no cache");
            const content = await fs.promises.readFile(filepath, "utf8");
            md5 = Buffer.from(content.slice(0, 32), "hex"), size = parseInt(content.slice(32));
            if (md5.length !== 16 || size > 0 === false) {
                fs.unlink(filepath, ()=>{});
                throw new Error("bad file");
            }
        } catch (e) {
            const task = (async()=>{
                const buf = await downloadWebImage.call(this, file, proxy=="1", timeout);
                if (buf) {
                    img.buf = buf;
                    img.size = buf.length;
                    img.md5 = common.md5(buf);
                    fs.writeFile(filepath, img.md5.toString("hex") + img.size, ()=>{});
                }
            })();
            stat.tasks.push(task);
        }
    }

    // base64图片
    else if (file.startsWith("base64://")) {
        file = file.replace("base64://", "");
        buf = Buffer.from(file, "base64");
        md5 = common.md5(buf), size = buf.length;
    }

    else {
        md5 = Buffer.from(file.slice(0, 32), "hex");
        //本地图片
        if (md5.length !== 16) {
            try {
                file = file.replace(/^file:\/{2,3}/, "");
                buf = await fs.promises.readFile(file);
                if (buf.length > 31457280)
                    return false;
                md5 = common.md5(buf), size = buf.length;
            } catch (e) {
                this.logger.warn(`获取本地图片 ${file} 失败。`);
                return false;
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
    if (is_group && url && url.includes("gchatpic_new")) {
        const id = url.match(/-[0-9]+-/);
        if (id)
            fid = parseInt(id[0].replace("-", "")) - 0xffffffff;
    }
    if (!is_group && url && url.includes("offpic_new")) {
        const id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
        if (id)
            fid = id[0].replace("/", "");
    }

    if (fid)
        (is_group?setGroupImageNested:setPrivateImageNested).call(this, img, fid);
    else
        stat.imgs.push(img);
    chain.set(elem, {type});
    return true;
}

/**
 * @param {String} cache_filepath 
 * @param {Buffer|String} file 
 * @returns {Buffer}
 */
async function audioTrans(cache_filepath, file) {
    let filepath, tmp;
    if (typeof file === "string") {
        filepath = file;
        file = await fs.promises.readFile(filepath);
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
                const target = await fs.promises.readFile(cache_filepath);
                this.logger.debug(`成功转换了一个音频。`);
                resolve(target);
            } catch (e) {
                this.logger.warn(`音频转码到amr失败，请确认你的ffmpeg可以处理此转换。`);
                reject();
            }
        })
    })
}

async function buildRecordMessage(chain, data, group_id) {
    let {file, cache, timeout, proxy} = data;
    if (!file) return;
    let buf, md5, size, codec, url;
    try {
        file = file.trim();
        file = file.replace(/^file:\/{2,3}/, "");
        url = file;
        const cache_filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
        const cache_filepath = path.join(this.dir, "..", "record", cache_filename);
        if (cache !== "0") {
            try {
                buf = await fs.promises.readFile(cache_filepath);
            } catch (e) {}
        }
        if (!buf) {
            if (file.startsWith("http://") || file.startsWith("https://"))
                file = await downloadWebRecord.call(this, file, proxy=="1", timeout);
            else if (file.startsWith("base64://"))
                file = Buffer.from(file.replace("base64://", ""), "base64");
            buf = await audioTrans.call(this, cache_filepath, file);
        }
        const head = buf.slice(0, 7).toString();
        codec = head.includes("SILK") ? 1 : 0;
    } catch (e) {
        this.logger.debug(e);
        this.logger.warn(`音频文件 ${url} 处理失败。`);
        return;
    }
    md5 = common.md5(buf), size = buf.length;
    try {
        var fid = await uploadPtt.call(this, group_id, buf, md5, codec);
    } catch(e) {
        this.logger.debug(e);
        return this.logger.debug("语音上传失败");
    }
    const elem = {
        1: 4,
        2: this.uin,
        3: fid,
        4: md5,
        5: md5.toString("hex") + ".amr",
        6: size,
        11: 1,
        18: fid,
        30: Buffer.from([8, 0, 40, 0, 56, 0]),
    };
    chain.set(elem, {type: "ptt"});
}

// function buildForwardNode(chain, data) {
//     let {name, uin, content, time} = data;
//     uin = parseInt(uin);
//     if (!common.checkUin(uin) || !content) return false;
//     content = String(content);
//     time = time ? parseInt(time) : common.timestamp();
//     name = name ? name : "NoName";
//     const elem = {text: {str: content}};
//     chain.set(elem, {
//         uin, content, time, name
//     });
//     return true;
// }

function buildLocationMessage(chain, data) {
    let {address, lat, lng, name, id} = data;
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
    return buildJsonMessage(chain, obj, "收到[[应用]地图]消息，请升级QQ版本查看");
}

function buildJsonMessage(chain, obj, text) {
    const elem = {51: {
        1: Buffer.concat([BUF1, zlib.deflateSync(JSON.stringify(obj))])
    }};
    chain.set(elem, {
        type: "json", text
    });
    return true;
}

async function buildAnonymousMessage(chain, data, group_id) {
    if (!group_id) {
        this.logger.warn("非群消息无法匿名");
        return null;
    }
    const {ignore} = data;
    const rsp = await getAnonInfo.call(this, group_id);
    if (!rsp) {
        if (ignore === "0")
            throw new Error("匿名失败，终止发送。");
        return null;
    }
    return {
        21: {
            1: 2,
            3: rsp[3].raw,
            4: rsp[4],
            5: rsp[6],
            6: rsp[5],
        }
    };
}

// function buildXmlMessage(chain, xml, svcid, text) {
//     const elem ={richMsg: {
//         template1: Buffer.concat([BUF1, zlib.deflateSync(xml)]),
//         serviceId: svcid,
//     }};
//     chain.set(elem, {
//         type: "xml", text
//     });
//     return true;
// }

function qs(s, sep = ",", equal = "=") {
    // fuck nodejs querystring
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
 * @param {Map} chain 
 * @param {String} message 
 * @param {Boolean} escape 
 * @param {Number} group_id 
 * @param {object} stat 
 */
async function buildMessageFromString(chain, message, escape, group_id, stat) {
    if (escape) {
        stat.length += buildTextMessage(chain, message);
        return;
    }
    const res = message.matchAll(/\[CQ:[^\]]+\]/g);
    let prev_index = 0
    for (let v of res) {
        const text = message.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
        if (text)
            await buildElement.call(this, chain, "text", {text}, group_id, stat)

        const element = v[0];
        let cq = element.replace("[CQ:", "cqtype=");
        cq = cq.substr(0, cq.length - 1);
        cq = qs(cq);
        await buildElement.call(this, chain, cq.cqtype.trim(), cq, group_id, stat)
        prev_index = v.index + element.length;
    }
    if (prev_index < message.length) {
        const text = message.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
        await buildElement.call(this, chain, "text", {text}, group_id, stat);
    }
}

/**
 * @param {import("../../client").MessageElem[]|String} message 
 * @param {Boolean} escape 
 * @param {Number} is_group 
 * @returns {Map}
 */
async function buildMessage(target, message, escape, is_group) {
    const chain = new Map();
    const stat = {
        length: 0, at_cnt: 0, face_cnt: 0, sface_cnt: 0, bface_cnt: 0, img_cnt: 0,
        is_forward: false, type: "stat", tasks: [], imgs: [], anon: undefined
    };
    chain.set("stat", stat);
    if (Array.isArray(message)) {
        for (let v of message) {
            if (!v || !v.data) continue;
            await buildElement.call(this, chain, v.type, v.data, is_group?target:0, stat);
        }
    } else {
        message = String(message);
        await buildMessageFromString.call(this, chain, message, escape, is_group?target:0, stat);
    }
    await Promise.all(stat.tasks);
    await uploadImages.call(this, target, stat.imgs, is_group);
    return chain;
}

/**
 * @param {Map} chain
 * @param {String} type
 * @param {object} data
 * @param {Number} group_id 
 * @param {object} stat
 */
async function buildElement(chain, type, data, group_id, stat) {
    // if (stat.is_forward && type !== "node")
    //     return;
    // if (chain.length > 1 && !stat.is_forward &&  type === "node")
    //     return;
    switch (type) {
        case "text":
            stat.length += buildTextMessage.call(this, chain, data.text);
            break;
        case "at":
            const l = buildAtMessage.call(this, chain, data, group_id);
            if (l > 0)
                stat.length += l, ++stat.at_cnt;
            break;
        case "face":
            if (buildFaceMessage.call(this, chain, data))
                ++stat.face_cnt;
            break;
        case "sface":
            if (buildSFaceMessage.call(this, chain, data))
                ++stat.sface_cnt;
            break;
        case "bface":
            if (buildBFaceMessage.call(this, chain, data))
                ++stat.bface_cnt;
            break;
        case "dice":
        case "rps":
            if (buildMagicFaceMessage.call(this, chain, type, data))
                ++stat.bface_cnt;
            break;
        case "image":
            if (await buildImageMessage.call(this, chain, data, group_id, stat))
                ++stat.img_cnt;
            break;
        case "flash":
            data.type = "flash";
            await buildImageMessage.call(this, chain, data, group_id, stat);
            break;
        case "record":
            await buildRecordMessage.call(this, chain, data, group_id);
            break;
        // case "node":
        //     if (buildForwardNode.call(this, chain, data))
        //         stat.is_forward = true;
        //     break;
        case "location":
            buildLocationMessage.call(this, chain, data);
            break;
        case "anonymous":
            if (stat.anon === undefined)
                stat.anon = await buildAnonymousMessage.call(this, chain, data, group_id);
            break;
        default:
            this.logger.warn("未知的CQ码类型：" + type);
            break;
    }
}

module.exports = buildMessage;
