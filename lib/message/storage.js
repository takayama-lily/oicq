"use strict";
const zlib = require("zlib");
const http = require("http");
const https = require("https");
const {highwayUpload, int32ip2str} = require("../service");
const querystring = require("querystring");
const tea = require("crypto-tea");
const pb = require("../pb");
const common = require("../common");
const imgSizeOf = require('image-size');

const img_types = {
    "jpg": 1000,
    "png": 1001,
    "bmp": 1005,
    "gif": 2000,
}

function getImgInfo(buf) {
    let width = 960, height = 640, type = undefined;
    if (buf) {
        try {
            const dimensions = imgSizeOf(buf);
            width = dimensions.width;
            height = dimensions.height;
            type = img_types[dimensions.type];
        } catch {}
    }
    return {
        width, height, type
    }
}

function setPrivateImageNested(img, fid) {
    const prop = getImgInfo(img.buf);
    Object.assign(img.nested, {
        1: img.md5.toString("hex"),
        2: img.size,
        3: fid,
        5: prop.type, //1000jpg 1001png 1003二压jpg 1005bmp 2000gif
        7: img.md5,
        8: prop.height,
        9: prop.width,
        10: fid,
        13: 0, //原图
        16: 3,
        24: 0,
        25: 0,
    });
}
function setGroupImageNested(img, fid) {
    const prop = getImgInfo(img.buf);
    Object.assign(img.nested, {
        2: img.md5.toString("hex"),
        7: fid,
        8: 0,
        9: 0,
        10: 66,
        12: 1,
        13: img.md5,
        // 17: 3,
        20: prop.type,
        22: prop.width,
        23: prop.height,
        24: 200, //201一般 300原图
        25: img.size,
        26: 0, //原图
        29: 0,
        30: 0,
    });
}

/**
 * @param {object[]} imgs
 *  @field {object} nested
 *  @field {Buffer} buf
 *  @field {Buffer} md5
 *  @field {Number} size
 */
async function imageStore(group_id, imgs) {
    const req = [];
    for (const v of imgs) {
        req.push({
            1: group_id,
            2: this.uin,
            3: 0,
            4: v.md5,
            5: v.size,
            6: v.md5.toString("hex"),
            7: 5,
            8: 9,
            9: 1,
            12: 1000,
            13: this.apk.version,
            15: 1052,
            16: 0, //原图
            19: 0,
        });
    }
    const body = pb.encode({
        1: 3,
        2: 1,
        3: req,
    });
    const blob = await this.sendUNI("ImgStore.GroupPicUp", body);
    let rsp = pb.decode(blob)[3];
    rsp = Array.isArray(rsp) ? rsp : [rsp];
    const tasks = [];
    for (let i = 0; i < imgs.length; ++i) {
        const v = rsp[i];
        setGroupImageNested(imgs[i], v[9]);
        if (v[4] || !imgs[i].buf) continue;
        if (!Array.isArray(v[6])) {
            v[6] = [v[6]];
            v[7] = [v[7]];
        }
        const index = i % v[6].slice(0, 1).length;
        imgs[i].key = v[8].raw;
        tasks.push(highwayUpload.call(this, v[6][index], v[7][index], imgs[i], 2));
    }
    await Promise.all(tasks);
}

async function offPicUp(user_id, imgs) {
    const req = [];
    for (const v of imgs) {
        req.push({
            1: this.uin,
            2: user_id,
            3: 0,
            4: v.md5,
            5: v.size,
            6: v.md5.toString("hex"),
            7: 5,
            8: 9,
            10: 0,
            12: 1,
            13: 0, //原图
            16: 1000,
            17: this.apk.version,
            22: 0,
        });
    }
    const body = pb.encode({
        1: 1,
        2: req
    });
    const blob = await this.sendUNI("LongConn.OffPicUp", body);
    let rsp = pb.decode(blob)[2];
    rsp = Array.isArray(rsp) ? rsp : [rsp];
    const tasks = [];
    for (let i = 0; i < imgs.length; ++i) {
        const v = rsp[i];
        setPrivateImageNested(imgs[i], v[10].raw);
        if (v[5] || !imgs[i].buf) continue;
        if (!Array.isArray(v[7])) {
            v[7] = [v[7]];
            v[8] = [v[8]];
        }
        const index = i % v[7].slice(0, 1).length;
        imgs[i].key = v[9].raw;
        tasks.push(highwayUpload.call(this, v[7][index], v[8][index], imgs[i], 1));
    }
    await Promise.all(tasks);
}

async function uploadImages(target, imgs, is_group) {
    let n = 0;
    while (imgs.length > n) {
        try {
            await (is_group?imageStore:offPicUp).call(this, target, imgs.slice(n, n + 20));
        } catch {}
        n += 20;
    }
}

/**
 * @this {import("../ref").Client}
 * @param {Number} target 
 * @param {Buffer} buf 
 * @param {Buffer} md5 
 * @param {0|1} codec 
 * @returns {Promise<Buffer>} fid
 */
async function uploadPtt(target, buf, md5, codec) {
    const body = pb.encode({
        1: 3,
        2: 3,
        5: [{
            1: target?target:1,
            2: this.uin,
            3: 0,
            4: md5,
            5: buf.length,
            6: md5,
            7: 5,
            8: 9,
            9: 4,
            11: 0,
            10: this.apk.version,
            12: 1,
            13: 1,
            14: codec,
            15: 1,
        }],
    });
    const blob = await this.sendUNI("PttStore.GroupPttUp", body);
    const rsp = pb.decode(blob)[5];
    if (!rsp[4]) {
        const ip = Array.isArray(rsp[5])?rsp[5][0]:rsp[5],
            port = Array.isArray(rsp[6])?rsp[6][0]:rsp[6];
        const ukey = rsp[7].raw.toString("hex"), filekey = rsp[11].raw.toString("hex");
        const params = {
            ver: 4679,
            ukey, filekey,
            filesize: buf.length,
            bmd5: md5.toString("hex"),
            mType: "pttDu",
            voice_encodec: codec
        }
        const url = `http://${int32ip2str(ip)}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": `QQ/${this.apk.version} CFNetwork/1126`,
            "Net-Type": "Wifi"
        };
        await new Promise((resolve)=>{
            http.request(url, {method: 'POST', headers}, resolve)
                .on("error", resolve)
                .end(buf);
        })
    }
    return rsp[11].raw;
}

/**
 * @this {import("../ref").Client}
 * @param {Number} target 
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
    const blob = await this.sendUNI("MultiMsg.ApplyUp", body);
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
    }
    const ip = Array.isArray(rsp[4])?rsp[4][0]:rsp[4],
        port = Array.isArray(rsp[5])?rsp[5][0]:rsp[5];
    await highwayUpload.call(this, ip, port, o, 27);
    return rsp[2].raw;
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer} resid 
 * @param {Number} bu 
 * @returns {Promise<Buffer>}
 */
async function downloadMultiMsg(resid, bu) {
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
    const blob = await this.sendUNI("MultiMsg.ApplyDown", body);
    const rsp = pb.decode(blob)[3];
    const ip = int32ip2str(Array.isArray(rsp[4])?rsp[4][0]:rsp[4]),
        port = Array.isArray(rsp[5])?rsp[5][0]:rsp[5];
    let url = port == 443 ? "https://ssl.htdata.qq.com" : `http://${ip}:${port}`;
    url += rsp[2].raw;
    const headers = {
        "User-Agent": `QQ/${this.apk.version} CFNetwork/1126`,
        "Net-Type": "Wifi"
    };
    return new Promise((resolve, reject)=>{
        const protocol = port == 443 ? https : http;
        protocol.get(url, {headers}, (res)=>{
            const data = [];
            res.on("data", (chunk)=>data.push(chunk));
            res.on("end", ()=>{
                try {
                    let buf = Buffer.concat(data);
                    if (res.headers["accept-encoding"] && res.headers["accept-encoding"].includes("gzip"))
                        buf = zlib.unzipSync(buf);
                    const head_len = buf.readUInt32BE(1);
                    const body_len = buf.readUInt32BE(5);
                    buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), rsp[3].raw);
                    buf = pb.decode(buf)[3];
                    // if (Array.isArray(buf)) buf = buf[0];
                    buf = zlib.unzipSync(buf[3].raw);
                    resolve(buf);
                } catch (e) {
                    reject();
                }
            })
        }).on("error", reject);
    });
}

/**
 * @this {import("../ref").Client}
 * @param {Number} group_id 
 * @param {Number} busid 
 * @param {Buffer|String} fileid 
 */
async function getGroupFileUrl(group_id, busid, fileid) {
    const body = pb.encode({
        3: {
            1: group_id,
            2: 3,
            3: busid,
            4: fileid,
        }
    });
    const blob = await this.sendUNI("OidbSvc.0x6d6_2", body);
    return pb.decode(blob)[4][3];
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer|String} fileid 
 */
async function getPrivateFileUrl(fileid) {
    const body = pb.encode({
        1: 1200,
        14: {
            10: this.uin,
            20: fileid,
            30: 2
        },
        101: 3,
        102: 104,
        99999: {
            1: 90200
        }
    });
    const blob = await this.sendUNI("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_DOWNLOAD-1200", body);
    const rsp = pb.decode(blob)[14][30];
    let url = String(rsp[50].raw);
    if (!url.startsWith("http"))
        url = `http://${rsp[30].raw}:${rsp[40]}` + url;
    return url;
}

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
        const blob = await this.sendUNI("group_anonymous_generate_nick.group", body);
        const rsp = pb.decode(blob)[11];
        if (!rsp[10][1])
            anon = rsp;
    } catch {}
    return anon;
}

module.exports = {
    uploadImages, uploadPtt, uploadMultiMsg, downloadMultiMsg, getGroupFileUrl, getPrivateFileUrl, 
    setPrivateImageNested, setGroupImageNested, getAnonInfo
}
