"use strict";
const zlib = require("zlib");
const querystring = require("querystring");
const {downloadMultiMsg} = require("./service");
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

/**
 * @param {Array} rich.elems
 * @returns {Object|String} String的时候是resid
 *  @field {Array} chain
 *  @field {String} raw_message
 */
function parseMessage(rich) {
    const elems = rich.elems;
    if (rich.ptt)
        elems.unshift({ptt: rich.ptt});
    const chain = [];
    let raw_message = "";
    let bface_tmp = null, ignore_text = false;
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
                    ignore_text = true;
                }
                if (data.app === "com.tencent.mannounce") {
                    msg.type = "notice";
                    msg.data.text = Buffer.from(data.meta.mannounce.text, "base64").toString();
                    ignore_text = true;
                }
                break;
            case "transElemInfo":
                msg.type = "file";
                msg.data = pb.decode("ObjMsg", o.elemValue.slice(3)).msgContentInfo[0].msgFile;
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
                }
                break;
            case "ptt":
                msg.type = "record";
                msg.data.file = o.fileMd5.toString("hex");
                ignore_text = true;
                break;
        }
        if (msg.type) {
            if (msg.type === "text" && chain[chain.length-1] && chain[chain.length-1].type === "text")
                chain[chain.length-1].data.text += msg.data.text;
            else
                chain.push(msg);
            if (msg.type === "text")
                raw_message +=  msg.data.text.replace(/[&\[\]]/g, escapeCQ);
            else
                raw_message += genCQMsg(msg);
        }
    }
    return {chain, raw_message};
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

module.exports = parseMessage;
