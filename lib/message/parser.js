"use strict";
const zlib = require("zlib");
const querystring = require("querystring");
const {downloadMultiMsg, getGroupFileUrl} = require("./storage");
const common = require("../common");
const pb = require("../pb");

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

async function parseMessage(rich, from = 0) {
    const elems = rich.elems;
    if (rich.ptt)
        elems.unshift({ptt: rich.ptt});
    const extra = {};
    const chain = [];
    let raw_message = "";
    let bface_tmp = null, ignore_text = false;
    for (let v of elems) {
        const type = Object.keys(v)[0];
        const msg = {type:"",data:{}};
        const o = v[type];
        switch (type) {
            case "anonGroupMsg":
            case "extraInfo":
                Object.assign(extra, o);
                break;
            case "generalFlags":
                if (o.longTextResid)
                    return await parseMultiMsg.call(this, o.longTextResid);
                break;
            case "richMsg":
                try {
                    [msg.type, msg.data] = await parseXmlElem.call(this, o);
                    ignore_text = true;
                } catch (e) {}
                break;
            case "lightApp":
                try {
                    [msg.type, msg.data] = await parseJsonElem.call(this, o);
                    ignore_text = true;
                } catch (e) {}
                break;
            case "transElemInfo":
                [msg.type, msg.data] = await parseTransElem.call(this, o, from);
                ignore_text = true;
                break;
            case "text":
                if (ignore_text) break;
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
                    ignore_text = true;
                } else if (o.serviceType === 33) {
                    msg.type = "sface";
                    const sface = pb.decode("MsgElemInfoServtype33", o.pbElem);
                    msg.data.id = sface.id;
                    msg.data.text = sface.text1;
                }
                break;
            case "ptt":
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
    return {chain, raw_message, extra};
}

function genCQMsg(msg) {
    return `[CQ:${msg.type},${querystring.stringify(msg.data, ",", "=", {encodeURIComponent: (s)=>s.replace(/&|,|\[|\]/g, escapeCQInside)})}]`;
}

function parseImage(o) {
    let data = {};
    data.file = o.md5.toString("hex");
    if (o.size)
        data.file += o.size;
    if (o.origUrl && o.downloadPath)
        data.url = "http://c2cpicdw.qpic.cn" + o.origUrl;
    else if (o.origUrl)
        data.url = "http://gchat.qpic.cn" + o.origUrl;
    return data;
}

async function parseMultiMsg(resid) {
    const resp = await downloadMultiMsg.call(this, resid, 1);
    return await parseMessage.call(this, resp.msg[0].body.richText);
}

async function parsePttElem(o) {
    const data = {md5: o.fileMd5.toString("hex")};
    if (o.downPara) {
        data.file = "https://grouptalk.c2c.qq.com" + String(o.downPara);
    } else if (o.fileUuid) {
        data.file = o.fileUuid.toString("hex");
    }
    return ["record", data];
}

async function parseTransElem(o, from) {
    let v = pb.decode("ObjMsg", o.elemValue.slice(3)).msgContentInfo[0].msgFile;
    let resp = await getGroupFileUrl.call(this, from, v.busId, v.filePath.toString());
    resp = resp.downloadFileRsp;
    const data = {
        name:     v.fileName,
        url:      `http://${resp.downloadIp}/ftn_handler/${resp.downloadUrl.toString("hex")}/?fname=${v.fileName}`,
        size:     common.toInt(v.fileSize),
        md5:      resp.md5.toString("hex"),
        duration: v.int64DeadTime.low,
    };
    return ["file", data];
}

async function parseXmlElem() {
    // xml消息 35合并转发 1415群好友推荐
    // var a = o.template1.slice(1);
    // a = zlib.unzipSync(a);
    // console.log(a.toString());
    throw new Error("not support yet");
}

async function parseJsonElem(o) {
    o = JSON.parse(zlib.unzipSync(o.data.slice(1)).toString());
    let type, data = {};
    if (o.app === "com.tencent.map") {
        type = "location";
        data = o.meta["Location.Search"];
        if (!data.id)
            delete data.id;
        delete data.from;
    } else if (o.app === "com.tencent.mannounce") {
        type = "notice";
        data.title = Buffer.from(o.meta.mannounce.title, "base64").toString();
        data.content = Buffer.from(o.meta.mannounce.text, "base64").toString();
    } else {
        throw new Error("unknown json msg");
    }
    return [type, data];
}

module.exports = parseMessage;
