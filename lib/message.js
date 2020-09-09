"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const querystring = require("querystring");
const spawn = require("child_process");
const {downloadWebImage, downloadWebRecord} = require("./service");
const common = require("./common");
const pb = require("./pb");

//----------------------------------------------------------------------------------------------------

function s_s(s) {
    if (s === "&") return "&amp;";
    if (s === ",") return "&#44;";
    if (s === "[") return "&#91;";
    if (s === "]") return "&#93;";
}
function _s_(s) {
    if (s === "&") return "&amp;";
    if (s === "[") return "&#91;";
    if (s === "]") return "&#93;";
}
function _ss_(s) {
    if (s === "&#91;") return "[";
    if (s === "&#93;") return "]";
    if (s === "&amp;") return "&";
}
function s__s(s) {
    if (s === "&#44;") return ",";
    if (s === "&#91;") return "[";
    if (s === "&#93;") return "]";
    if (s === "&amp;") return "&";
}

/**
 * @param {Array} elems 
 * @returns {Object|String} String的时候是resid
 *  @field {Array} chain
 *  @field {String} raw_message
 */
function parseMessage(elems) {
    const chain = [];
    let raw_message = "";
    let bface_tmp = null, light_app = false;
    for (let v of elems) {
        const type = Object.keys(v)[0];
        const msg = {type:"",data:{}};
        const o = v[type];
        switch (type) {
            case "richMsg":
                if (o.serviceId === 35) {
                    for (let vv of elems) {
                        if (vv.generalFlags && vv.generalFlags.longTextResid) 
                            return vv.generalFlags.longTextResid;
                    }
                }
                // xml消息 35合并转发 1415群好友推荐
                // var a = o.template1.slice(1);
                // a = zlib.unzipSync(a);
                // console.log(a.toString());
                break;
            case "lightApp":
                const data = JSON.parse(zlib.unzipSync(o.data.slice(1)).toString());
                if (data.app === "com.tencent.map") {
                    msg.type = "location";
                    msg.data = data.meta["Location.Search"];
                    delete msg.data.from;
                    light_app = true;
                }
                break;
            case "transElemInfo":
                msg.type = "file";
                msg.data = pb.decode("ObjMsg", o.elemValue.slice(3)).msgContentInfo[0].msgFile;
                break;
            case "text":
                if (light_app) break;
                if (bface_tmp && o.str && o.str.startsWith("[")) {
                    msg.data.file = bface_tmp, msg.type = "bface";
                    msg.data.text = o.str.replace("[","").replace("]","").trim();
                    bface_tmp = null;
                    break;
                }
                if (o.attr6Buf && o.attr6Buf[1] === 1) {
                    msg.type = "at";
                    if (o.attr6Buf[6] === 1)
                        msg.data.qq = "all"
                    else
                        msg.data.qq = o.attr6Buf.readUInt32BE(7);
                } else {
                    msg.type = "text";
                }
                msg.data.text = o.str;
                break;
            case "face":
                msg.type = "face", msg.data.id = o.index;
                break;
            case "marketFace":
                bface_tmp = o.faceId.toString("hex") + o.key.toString("hex") + o.tabId;
                break;
            case "notOnlineImage":
            case "customFace":
                msg.type = "image";
                msg.data = parseImage(o);
                break;
            case "commonElem":
                if (o.serviceType === 3) {
                    const flash = pb.decode("MsgElemInfoServtype3", o.pbElem);
                    msg.type = "flash";
                    msg.data = parseImage(flash[Object.keys(flash)[0]]);
                    return {
                        chain: [msg],
                        raw_message: `[CQ:flash,file=${msg.data.file}]`
                    };
                }
                break;
            case "ptt":
                msg.type = "record";
                msg.data.file = o.fileMd5.toString("hex");
                break;
        }
        if (msg.type) {
            if (msg.type === "text" && chain[chain.length-1] && chain[chain.length-1].type === "text")
                chain[chain.length-1].data.text += msg.data.text;
            else
                chain.push(msg);
            if (msg.type === "text")
                raw_message +=  msg.data.text.replace(/[&\[\]]/g, _s_);
            else
                raw_message += buildRawMessage(msg);
        }
    }
    return {chain, raw_message};
}

function buildRawMessage(msg) {
    return `[CQ:${msg.type},${querystring.stringify(msg.data, ",", "=", {encodeURIComponent: (s)=>s.replace(/&|,|\[|\]/g, s_s)})}]`;
}

function parseImage(o) {
    let data = {};
    if (o.picMd5) {
        data.file = o.picMd5.toString("hex");
        if (o.fileLen)
            data.file += o.fileLen;
        if (o.origUrl)
            data.url = "http://c2cpicdw.qpic.cn" + o.origUrl;
    } else {
        data.file = o.md5.toString("hex");
        if (o.size)
            data.file += o.size;
        if (o.origUrl)
            data.url = "http://gchat.qpic.cn" + o.origUrl;
    }
    return data;
}

//----------------------------------------------------------------------------------------------------

const AT_BUF = Buffer.from([0,1,0,0,0]);
const BUF1 = Buffer.from([1]);
const BUF2 = Buffer.alloc(2);
const BUF4 = Buffer.alloc(4);
const FACE_OLD_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xCC, 0xF5, 0xD0]);

/**
 * @param {Array} chain 
 * @param {String} text 
 * @returns {Number} text byte length
 */
function buildTextMessage(chain, text) {
    if (!text) return 0;
    text = text.toString()
    chain.push({text: {str: text}});
    return Buffer.byteLength(text);
}

/**
 * @returns {Number} display byte length
 */
function buildAtMessage(chain, cq) {
    let {qq, text} = cq;
    if (qq === "all") {
        var q = 0, flag = 1, display = "@全体成员";
    } else {
        var q = parseInt(qq), flag = 0, display = text ? text : ("@" + q);
    }
    if (!common.checkUin(q))
        return 0;
    const buf = Buffer.alloc(6);
    buf.writeUInt8(display.length), buf.writeUInt8(flag, 1), buf.writeUInt32BE(q, 2);
    chain.push({text: {
        str: display,
        attr6Buf: Buffer.concat([AT_BUF, buf, BUF2])
    }});
    return Buffer.byteLength(display);
}

/**
 * @returns {Boolean} success?
 */
function buildFaceMessage(chain, cq) {
    let {id} = cq;
    id = parseInt(id);
    if (id > 0xff) return false;
    const old = Buffer.alloc(2);
    old.writeUInt16BE(0x1441 + id);
    chain.push({face: {
        index: id,
        old: old,
        buf: FACE_OLD_BUF
    }});
    return true;
}

const bface_pbres = Buffer.from([0x0a,0x06,0x08,0xac,0x02,0x10,0xac,0x02,0x0a,0x06,0x08,0xc8,0x01,0x10,0xc8,0x01,0x40,0x01,0x62,0x09,0x23,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x6a,0x09,0x23,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30]);
/**
 * @returns {Boolean} success?
 */
function buildBFaceMessage(chain, cq) {
    try {
        let {file, text} = cq;
        text = "["+text.slice(0, 5)+"]";
        chain.push({marketFace: {
            faceName: Buffer.from(text),
            itemType: 6,
            faceInfo: 1,
            faceId: Buffer.from(file.slice(0, 32), "hex"),
            tabId: parseInt(file.slice(64)),
            subType: 3,
            key: Buffer.from(file.slice(32, 64), "hex"),
            mediaType: 0,
            imageWidth: 200,
            imageHeight: 200,
            pbReserve: bface_pbres,
        }});
        chain.push({text: {
            str: text,
        }});
        return true;
    } catch (e) {
        return false;
    }
}

async function downloadImage(url, cb) {
    try {
        cb(await downloadWebImage(url));
    } catch (e) {
        cb();
    }
}

/**
 * @param {Boolean} is_group 
 * @returns {Boolean|Promise} success?
 * @param {Boolean} is_flash 
 */
async function buildImageMessage(chain, cq, is_group, is_flash = false) {
    let {file, url, cache} = cq;
    if (!file) return false;
    file = file.trim();
    let buf, md5, size, from_web = false, download_cb;
    if (file.startsWith("http://") || file.startsWith("https://")) {
        const filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
        const filepath = path.join(process.OICQ.config.cache_root, "image", filename);
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
            md5 = crypto.randomBytes(16), size = common.rand(6), from_web = true;
            download_cb = (img)=>{
                md5 = common.md5(img);
                fs.writeFile(filepath, md5.toString("hex") + img.length, ()=>{});
                return md5;
            };
        }
    } else {
        md5 = Buffer.from(file.slice(0, 32), "hex");
        if (md5.length !== 16) {
            try {
                file = file.replace(/^file:\/{2,3}/, "");
                buf = await fs.promises.readFile(file);
                if (buf.length > 31457280)
                    return false;
                md5 = common.md5(buf), size = buf.length;
            } catch (e) {
                process.OICQ.logger.warn(`获取本地图片 ${file} 失败，已忽略该图片。`);
                return false;
            }
        } else {
            size = parseInt(file.substr(32));
            size = size > 0 ? size : 0;
        }
    }
    const hex = md5.toString("hex");

    if (is_flash) {
        if (from_web) {
            try {
                buf = await downloadWebImage(file);
                md5 = download_cb(buf), size = buf.length;
            } catch (e) {
                process.OICQ.logger.error(`闪照 ${file} 下载失败。`);
                return false;
            }
        }
        return {
            buf, md5, size
        };
    }

    let elem, index = chain.length - 1;
    if (is_group) {
        elem = {customFace: {
            fileType:   66,
            useful:     1,
            origin:     1,
            fileId:     0,
            size:       size,
            filePath:   hex,
            md5:        md5,
            flag:       BUF4,
        }};
        chain.push(elem);
        if (url && url.includes("gchatpic_new")) {
            const fid = url.match(/-[0-9]+-/);
            if (fid)
                elem.customFace.fileId = parseInt(fid[0].replace("-", "")) - 0xffffffff;
        }
        if (from_web) {
            return downloadImage(file, (buf)=>{
                if (!buf) return;
                md5 = download_cb(buf), size = buf.length;
                elem.customFace.size = size;
                elem.customFace.md5 = md5;
                elem.customFace.filePath = md5.toString("hex");
                chain[0].push({
                    buf, md5, size, index
                });
            })
        } else if (!elem.customFace.fileId && size) {
            chain[0].push({
                buf, md5, size, index
            });
        }
    } else {
        elem = {notOnlineImage: {
            filePath:       hex,
            // resId:          "",
            fileLen:        size,
            oldPicMd5:      false,
            picMd5:         md5,
            // downloadPath:   "",
            original:       1,
            pbReserve:      Buffer.from([0x78, 0x02]),
        }};
        chain.push(elem);
        if (url && url.includes("offpic_new")) {
            const id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
            if (id) {
                elem.notOnlineImage.resId = id[0].replace("/", "");
                elem.notOnlineImage.downloadPath = elem.notOnlineImage.resId;
            }
        }
        if (from_web) {
            return downloadImage(file, (buf)=>{
                if (!buf) return;
                md5 = download_cb(buf), size = buf.length;
                elem.notOnlineImage.fileLen = size;
                elem.notOnlineImage.picMd5 = md5;
                chain[0].push({
                    buf, md5, size, index
                });
            })
        } else if (!elem.notOnlineImage.resId && size) {
            chain[0].push({
                buf, md5, size, index
            });
        }
    }
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
        tmp = common.uuid();
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
            process.OICQ.logger.debug("ffmpeg error: " + error);
            process.OICQ.logger.debug("ffmpeg output: " + stdout + stderr);
            if (tmp)
                fs.unlink(filepath, ()=>{});
            try {
                const target = await fs.promises.readFile(cache_filepath);
                process.OICQ.logger.debug(`成功转换了一个音频。`);
                resolve(target);
            } catch (e) {
                process.OICQ.logger.warn(`音频转码到amr失败，请确认你的ffmpeg可以处理此转换。`);
                reject();
            }
        })
    })
}

async function buildRecordMessage(chain, data, is_group) {
    if (!is_group) return false;
    let {file} = data;
    if (!file) return false;
    let buf, md5, size, ext, url;
    try {
        file = file.trim();
        file = file.replace(/^file:\/{2,3}/, "");
        url = file;
        const cache_filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
        const cache_filepath = path.join(process.OICQ.config.cache_root, "record", cache_filename);
        if (data.cache !== "0") {
            try {
                buf = await fs.promises.readFile(cache_filepath);
            } catch (e) {}
        }
        if (!buf) {
            if (file.startsWith("http://") || file.startsWith("https://"))
                file = await downloadWebRecord(file);
            buf = await audioTrans(cache_filepath, file);
        }
        const head = buf.slice(0, 7).toString();
        ext = head.includes("SILK") ? ".slk" : ".amr";
    } catch (e) {
        process.OICQ.logger.debug(e);
        process.OICQ.logger.warn(`音频文件 ${url} 处理失败。`);
        return false;
    }
    md5 = common.md5(buf), size = buf.length;
    return {
        buf, md5, size, ext
    };
}

function buildForwardNode(chain, data) {
    let {name, uin, content, time} = data;
    uin = parseInt(uin);
    if (!common.checkUin(uin) || !content) return false;
    content = content.toString();
    time = time ? parseInt(time) : common.timestamp();
    name = name ? name : "无名氏";
    chain.push({
        uin, content, time, name
    });
    return true;
}

function buildLocationNode(chain, data) {
    let {address, lat, lng, name, id} = data;
    if (!address || !lat || !lng) return;
    name = name ? name : "位置分享";
    let build = {
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
    build = Buffer.concat([BUF1, zlib.deflateSync(JSON.stringify(build))]);
    chain.push({
        lightApp: {data: build}
    });
    chain.push({
        text: {str: "收到[[应用]地图]消息，请升级QQ版本查看"}
    });
}

/**
 * @async
 * @param {Array} chain 
 * @param {String} message 
 * @param {Boolean} escape 
 * @param {Boolean} is_group 
 * @param {Object} stat 
 *  @field length
 *  @field at_cnt
 *  @field face_cnt
 *  @field img_cnt
 * @param {Promise[]} tasks 
 */
async function buildMessageFromString(chain, message, escape, is_group, stat, tasks) {
    let elem;
    if (escape) {
        stat.length += buildTextMessage(chain, message);
        return;
    }
    const res = message.matchAll(/\[CQ:[^\]]+\]/g);
    let prev_index = 0
    for (let v of res) {
        const text = message.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, _ss_);
        if (text)
            await buildElement(chain, "text", {text}, is_group, stat, tasks)

        const element = v[0];
        let cq = element.replace("[CQ:", "cqtype=");
        cq = cq.substr(0, cq.length - 1);
        cq = querystring.parse(cq, ",");
        for (let k of Object.keys(cq))
            cq[k] = cq[k].replace(/&#44;|&#91;|&#93;|&amp;/g, s__s);

        elem = await buildElement(chain, cq.cqtype.trim(), cq, is_group, stat, tasks)
        if (stat.is_ptt || stat.is_flash)
            return elem;

        prev_index = v.index + element.length;
    }
    if (prev_index < message.length) {
        const text = message.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, _ss_);
        await buildElement(chain, "text", {text}, is_group, stat, tasks)
    }
}

/**
 * @async
 * @param {Array|String} message 
 * @param {Boolean} escape 
 * @param {Boolean} is_group 
 * @returns {Array} chain 头元素记录了图片信息，尾元素记录了是否是长消息
 */
async function buildMessage(message, escape, is_group) {
    const chain = [[]], tasks = [];
    const stat = {
        length: 0, at_cnt: 0, face_cnt: 0, bface_cnt: 0, img_cnt: 0,
        is_ptt: false, is_flash: false, is_forward: false
    };
    let elem;
    if (typeof message === "string")
        elem = await buildMessageFromString(chain, message, escape, is_group, stat, tasks);
    else {
        for (let v of message) {
            if (!v.data) continue;
            elem = await buildElement(chain, v.type, v.data, is_group, stat, tasks);
            if (stat.is_ptt || stat.is_flash)
                break;
        }
    }

    if (stat.is_ptt) {
        return {
            type: "ptt", elem
        }
    }

    if (stat.is_flash) {
        return {
            type: "flash", elem
        }
    }

    if (stat.is_forward) {
        chain.shift();
        return {
            type: "forward", elem: chain
        }
    }

    if (tasks.length)
        await Promise.all(tasks);

    stat.length += stat.at_cnt * 22 + stat.face_cnt * 23 + stat.bface_cnt * 140 + stat.img_cnt * (is_group?90:304);
    stat.length *= 1.05;
    const is_long = is_group ? (stat.length>790) : (stat.length>935);
    chain.push(is_long);
    return chain;
}

// function buildReplyMessage(chain, cq) {
//     const {seq} = common.parseGroupMessageId(cq.id);
//     chain.push({
//         srcMsg: {
//             origSeqs: [ seq ],
//             // senderUin: ,
//             // time: ,
//             flag: 1,
//             type: 1,
//             pbReserve: Buffer.from([0x18, 0xaf, 0xf4, 0xcd, 0xcc, 0x84, 0x80, 0x80, 0x80, 0x01]),
//             // toUin: 
//           }
//     });
// }

/**
 * @param {Object[]} chain 消息链
 * @param {String} type 元素类型
 * @param {Object} data 元素数据
 * @param {Boolean} is_group 
 * @param {Object} stat 各元素长度统计
 *  @field length
 *  @field at_cnt
 *  @field face_cnt
 *  @field img_cnt
 * @param {Promise[]} tasks 异步任务列表
 */
async function buildElement(chain, type, data, is_group, stat, tasks) {
    if (stat.is_forward && type !== "node")
        return;
    if (chain.length > 1 && !stat.is_forward &&  type === "node")
        return;
    switch (type) {
        // case "reply":
        //     buildReplyMessage(chain, data);
        //     break;
        case "text":
            stat.length += buildTextMessage(chain, data.text);
            break;
        case "at":
            const l = buildAtMessage(chain, data);
            if (l > 0)
                stat.length += l, ++stat.at_cnt;
            break;
        case "face":
            if (buildFaceMessage(chain, data))
                ++stat.face_cnt;
            break;
        case "bface":
            if (buildBFaceMessage(chain, data))
                ++stat.bface_cnt;
            break;
        case "image":
            var task = await buildImageMessage(chain, data, is_group);
            if (task !== false)
                ++stat.img_cnt;
            if (task instanceof Promise)
                tasks.push(task);
            break;
        case "flash":
            const flash = await buildImageMessage(chain, data, is_group, true);
            if (flash) {
                stat.is_flash = true;
                return flash;
            }
            break;
        case "record":
            const ptt = await buildRecordMessage(chain, data, is_group);
            if (ptt) {
                stat.is_ptt = true;
                return ptt;
            }
            break;
        case "node":
            if (buildForwardNode(chain, data))
                stat.is_forward = true;
            break;
        case "location":
            buildLocationNode(chain, data);
            break;
        default:
            break;
    }
}

//----------------------------------------------------------------------------------------------------

module.exports = {
    parseMessage, buildMessage, buildRawMessage
};
