"use strict";
const fs = require("fs");
const querystring = require("querystring");
const http = require("http");
const https = require("https");
const common = require("./common");

//----------------------------------------------------------------------------------------------------

function _s_(s) {
    if (s === "&") return "&amp;";
    if (s === "[") return "&#91;";
    if (s === "]") return "&#93;";
}
function toCQText(text) {
    return text.replace(/[&\[\]]/g, _s_);
}
function toCQAt(user_id, text) {
    return `[CQ:at,qq=${user_id}${text?(",text="+text):""}]`;
}
function toCQFace(id) {
    return `[CQ:face,id=${id}]`;
}
function toCQImage(file, url) {
    return `[CQ:image,file=${file},url=${url}]`;
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
    for (let v of elems) {
        const type = Object.keys(v)[0];
        const msg = {type:"",data:{}};
        const o = v[type];
        switch (type) {
            case "richMsg":
                return {
                    chain: [
                        {
                            type: "text",
                            data: {
                                text: "[暂不支持解析长消息和转发消息，请期待后续版本]"
                            }
                        }
                    ],
                    raw_message: "[暂不支持解析长消息和转发消息，请期待后续版本]"
                }
                for (let vv of elems) {
                    if (vv.generalFlags && vv.generalFlags.longTextResid) 
                        return vv.generalFlags.longTextResid;
                }
                break;
            case "lightApp":
            case "transElemInfo":
                break;
            case "text":
                if (o.attr6Buf && o.attr6Buf[1] === 1) {
                    msg.type = "at";
                    if (o.attr6Buf[6] === 1)
                        msg.data.qq = "all"
                    else {
                        msg.data.qq = o.attr6Buf.slice(7, 11).readUInt32BE();
                        msg.data.text = o.str;
                    } 
                    chain.push(msg);
                    raw_message += toCQAt(msg.data.qq, msg.data.text);
                    break;
                }
                if (chain[chain.length-1] && chain[chain.length-1].type === type) {
                    chain[chain.length-1].data.text += o.str;
                } else {
                    msg.type = "text", msg.data.text = o.str;
                    chain.push(msg);
                }
                raw_message += toCQText(o.str);
                break;
            case "face":
                msg.type = "face", msg.data.id = o.index;
                chain.push(msg);
                raw_message += toCQFace(o.index);
                break;
            case "notOnlineImage":
            case "customFace":
                msg.type = "image";
                if (type === "notOnlineImage") {
                    msg.data.file = o.picMd5.toString("hex") + o.fileLen;
                    msg.data.url = "http://c2cpicdw.qpic.cn" + o.origUrl;
                } else {
                    msg.data.file = o.md5.toString("hex") + o.size;
                    msg.data.url = "http://gchat.qpic.cn" + o.origUrl;
                }
                chain.push(msg);
                raw_message += toCQImage(msg.data.file, msg.data.url);
                break;
        }
    }
    return {chain, raw_message};
}

//----------------------------------------------------------------------------------------------------

const AT_BUF = Buffer.from([0,1,0,0,0]);
const BUF2 = Buffer.alloc(2);
const BUF4 = Buffer.alloc(4);
const FACE_OLD_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xCC, 0xF5, 0xD0]);

/**
 * @param {Array} chain 
 * @param {String} text 
 * @returns {Number} text byte length
 */
function buildTextMessage(chain, text) {
    if (text)
        chain.push({text: {str: text.toString()}});
    return Buffer.byteLength(text);
}

/**
 * @param {Array} chain 
 * @param {Number|String} qq 
 * @param {String|undefined} text 
 * @returns {Number} display byte length
 */
function buildAtMessage(chain, qq, text) {
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
 * @param {Array} chain 
 * @param {Number|String} id 
 * @returns {Boolean} success?
 */
function buildFaceMessage(chain, id) {
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

const MAX_IMG_SIZE = 31457280;
async function downloadImage(protocol, url) {
    return new Promise((resolve, reject)=>{
        try {
            protocol.get(url, {timeout: 30000}, (res)=>{
                if (!res.headers["content-type"] || !res.headers["content-type"].startsWith("image/")) {
                    reject();
                    return;
                }
                if (res.headers["content-length"] && res.headers["content-length"] > MAX_IMG_SIZE) {
                    reject();
                    return;
                }
                let image = [];
                res.on("data", (chunk)=>{
                    image.push(chunk);
                });
                res.on("end", ()=>{
                    image = Buffer.concat(image);
                    if (image.length > MAX_IMG_SIZE)
                        reject();
                    else
                        resolve(image);
                });
            }).on("error", reject);
        } catch (e) {
            reject();
        }
    });
}

/**
 * 这里需要改进，所有的图片可以同时下载，目前为一张一张下载
 * @param {Array} chain 
 * @param {String} file 
 * @param {String|undefined} url 
 * @param {Boolean} is_group 
 * @returns {Boolean} success?
 */
async function buildImageMessage(chain, file, url, is_group) {
    if (!file) return false;
    file = file.trim();
    let buf, md5, size;
    if (file.startsWith("http://") || file.startsWith("https://")) {
        try {
            const protocol = file.startsWith("https") ? https : http;
            buf = await downloadImage(protocol, file);
            md5 = common.md5(buf), size = buf.length;
        } catch (e) {return false;}
    } else {
        md5 = Buffer.from(file.slice(0, 32), "hex");
        if (md5.length !== 16) {
            try {
                file = file.replace(/^file:\/{2,3}/, "");
                buf = await fs.promises.readFile(file);
                md5 = common.md5(buf), size = buf.length;
            } catch (e) {return false;}
        } else {
            size = parseInt(file.substr(32));
            size = size ? size : 0;
        }
    }
    const hex = md5.toString("hex");
    let elem;
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
        if (url && url.includes("gchatpic_new")) {
            const fid = url.match(/-[0-9]+-/);
            if (fid)
                elem.customFace.fileId = parseInt(fid[0].replace("-", "")) - 0xffffffff;
        }
        if (!elem.customFace.fileId && size) {
            chain[0].push({
                buf, md5, size,
                index: chain.length - 1
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
        if (url && url.includes("offpic_new")) {
            const id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
            if (id) {
                elem.notOnlineImage.resId = id[0].replace("/", "");
                elem.notOnlineImage.downloadPath = elem.notOnlineImage.resId;
            }
        }
        if (!elem.notOnlineImage.resId && size) {
            chain[0].push({
                buf, md5, size,
                index: chain.length - 1
            });
        }
    }
    chain.push(elem);
    return true;
}

/**
 * @async
 * @param {Array} chain 
 * @param {String} message 
 * @param {Boolean} escape 
 * @param {Boolean} is_group 
 * @returns {Object}
 *  @field length
 *  @field at_cnt
 *  @field face_cnt
 *  @field img_cnt
 */
async function buildMessageFromString(chain, message, escape = false, is_group = true) {
    if (escape) {
        return buildTextMessage(chain, message);
    }
    const res = message.matchAll(/\[CQ:[^\]]+\]/g);
    let prev_index = 0
    let length = 0, at_cnt = 0, face_cnt = 0, img_cnt = 0;
    for (let v of res) {
        const text = message.slice(prev_index, v.index);
        if (text)
            length += buildTextMessage(chain, text);

        const elem = v[0];
        let cq = elem.replace("[CQ:", "cqtype=");
        cq = cq.substr(0, cq.length - 1);
        cq = querystring.parse(cq, ",");
        switch (cq.cqtype.trim()) {
            case "at":
                const l = buildAtMessage(chain, cq.qq, cq.text);
                if (l > 0)
                    length += l, ++at_cnt;
                break;
            case "face":
                if (buildFaceMessage(chain, cq.id))
                    ++face_cnt;
                break;
            case "image":
                if (await buildImageMessage(chain, cq.file, cq.url, is_group))
                    ++img_cnt;
                break;
            default:
                break;
        }

        prev_index = v.index + elem.length;
    }
    if (prev_index < message.length)
        length += buildTextMessage(chain, message.slice(prev_index));
    return {length, at_cnt, face_cnt, img_cnt};
}

/**
 * @async
 * @param {Array|String} message 
 * @param {Boolean} escape 
 * @param {Boolean} is_group 
 * @returns {Array} chain 头元素记录了图片信息，尾元素记录了是否是长消息
 */
async function buildMessage(message, escape, is_group) {
    const chain = [[]];
    var length = 0, at_cnt = 0, face_cnt = 0, img_cnt = 0;
    if (typeof message === "string")
        var {length, at_cnt, face_cnt, img_cnt} = await buildMessageFromString(chain, message, escape, is_group);
    else {
        for (let v of message) {
            if (!v.data) continue;
            switch (v.type) {
                case "text":
                    length += buildTextMessage(chain, v.data.text);
                    break;
                case "at":
                    const l = buildAtMessage(chain, v.data.qq, v.data.text);
                    if (l > 0)
                        length += l, ++at_cnt;
                    break;
                case "face":
                    if (buildFaceMessage(chain, v.data.id))
                        ++face_cnt;
                    break;
                case "image":
                    if (await buildImageMessage(chain, v.data.file, is_group))
                        ++img_cnt;
                default:
                    break;
            }
        }
    }

    length += at_cnt * 22 + face_cnt * 23 + img_cnt * (is_group?90:304);
    length *= 1.1;
    const is_long = is_group ? (length>790) : (length>935);
    chain.push(is_long);
    return chain;
}

//----------------------------------------------------------------------------------------------------

module.exports = {
    parseMessage, buildMessage
};
