"use strict";
const fs = require("fs");
const querystring = require("querystring");
const http = require("http");
const https = require("https");
const common = require("./common");

//----------------------------------------------------------------------------------------------------

function toCQAt(user_id, text) {
    return `[CQ:at,qq=${user_id}${text?(",text="+text):""}]`;
}
function toCQFace(id) {
    return `[CQ:face,id=${id}]`;
}
function toCQImage(file, url) {
    return `[CQ:image,file=${file},url=${url}]`;
}

function parseMessage(elems) {
    const chain = [];
    let raw_message = "";
    for (let v of elems) {
        const type = Object.keys(v)[0];
        const msg = {type:"",data:{}};
        const o = v[type];
        switch (type) {
            case "richMsg":
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
                raw_message += o.str;
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
const PB_BUF = Buffer.from([
    0x08, 0x09, 0x78, 0x00, 0xC8, 0x01, 0x00, 0xF0, 0x01, 0x00, 0xF8, 0x01, 0x00, 0x90, 0x02, 0x00,
    0xC8, 0x02, 0x00, 0x98, 0x03, 0x00, 0xA0, 0x03, 0x20, 0xB0, 0x03, 0x00, 0xC0, 0x03, 0x00, 0xD0,
    0x03, 0x00, 0xE8, 0x03, 0x00, 0x8A, 0x04, 0x02, 0x08, 0x03, 0x90, 0x04, 0x80, 0x80, 0x80, 0x10,
    0xB8, 0x04, 0x00, 0xC0, 0x04, 0x00,
]);

function buildTextMessage(chain, text) {
    // if (text.length >= 100) {
    //     chain.push({text: {str: text.substr(0, 100)}});
    //     text = text.substr(100);
    //     buildTextMessage(chain, text);
    // } else
    chain.push({text: {str: text}});
}
function buildAtMessage(chain, qq, text) {
    if (qq === "all") {
        var q = 0, flag = 1, display = "@全体成员";
    } else {
        var q = parseInt(qq), flag = 0, display = text ? text : ("@" + q);
    }
    const buf = Buffer.alloc(6);
    buf.writeUInt8(display.length), buf.writeUInt8(flag, 1), buf.writeUInt32BE(q, 2);
    chain.push({text: {
        str: display,
        attr6Buf: Buffer.concat([AT_BUF, buf, BUF2])
    }});
}
function buildFaceMessage(chain, id) {
    id = parseInt(id);
    const old = Buffer.alloc(2);
    old.writeUInt16BE(0x1445 - 4 + id);
    chain.push({face: {
        index: id,
        old: old,
        buf: FACE_OLD_BUF
    }});
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

//这里需要改进，所有的图片可以同时下载，目前为一张一张下载
async function buildImageMessage(chain, file, url, is_group) {
    if (!file) return;
    file = file.trim();
    let buf, md5, size;
    if (file.startsWith("http://") || file.startsWith("https://")) {
        try {
            const protocol = file.startsWith("https") ? https : http;
            buf = await downloadImage(protocol, file);
            md5 = common.md5(buf), size = buf.length;
        } catch (e) {return}
    } else {
        md5 = Buffer.from(file.slice(0, 32), "hex");
        if (md5.length !== 16) {
            try {
                file = file.replace(/^file:\/{2,3}/, "");
                buf = await fs.promises.readFile(file);
                md5 = common.md5(buf), size = buf.length;
            } catch (e) {return}
        } else {
            size = parseInt(file.substr(32));
        }
    }
    size = size ? size : 0;
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
            let fid = url.match(/-[0-9]+-/);
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
            let id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
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
}

async function buildFromCQ(chain, cq, is_group) {
    cq = cq.replace("[CQ:", "cqtype=");
    cq = cq.substr(0, cq.length - 1);
    cq = querystring.parse(cq, ",");
    switch (cq.cqtype.trim()) {
        case "at":
            buildAtMessage(chain, cq.qq, cq.text);
            break;
        case "face":
            buildFaceMessage(chain, cq.id);
            break;
        case "image":
            await buildImageMessage(chain, cq.file, cq.url, is_group);
            break;
        default:
            break;
    }
}

async function buildMessageFromString(chain, message, escape = false, is_group = true) {
    if (escape) {
        return buildTextMessage(chain, message);
    }
    const res = message.matchAll(/\[CQ:[^\]]+\]/g);
    let prev_index = 0;
    for (let v of res) {
        const text = message.slice(prev_index, v.index);
        if (text)
            buildTextMessage(chain, text);
        const cq = v[0];
        await buildFromCQ(chain, cq, is_group);
        prev_index = v.index + cq.length;
    }
    if (prev_index < message.length)
        buildTextMessage(chain, message.slice(prev_index));
}

async function buildMessage(message, escape, is_group) {
    const chain = [[]];
    if (typeof message === "string")
        await buildMessageFromString(chain, message, escape, is_group);
    else {
        for (let v of message) {
            switch (v.type) {
                case "text":
                    buildTextMessage(chain, v.data.text);
                    break;
                case "at":
                    buildAtMessage(chain, v.data.qq, v.data.text);
                    break;
                case "face":
                    buildFaceMessage(chain, v.data.id);
                    break;
                case "image":
                    await buildImageMessage(chain, v.data.file, is_group);
                default:
                    break;
            }
        }
    }
    if (is_group && chain.length > 1)
        chain.push({generalFlags: {
            pbReserve: PB_BUF
        }});
    return chain;
}

//----------------------------------------------------------------------------------------------------

module.exports = {
    parseMessage, buildMessage
};
