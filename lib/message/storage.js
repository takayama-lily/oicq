"use strict";
const zlib = require("zlib");
const http = require("http");
const https = require("https");
const {highwayUpload, int32ip2str} = require("../service");
const querystring = require("querystring");
const tea = require("crypto-tea");
const pb = require("../pb");
const pb2 = require("../pb2");
const common = require("../common");
const BUF0 = Buffer.alloc(0);

/**
 * @param {object[]} images
 *  @field {Buffer} md5
 *  @field {Number} size
 */
async function imageStore(group_id, images) {
    const req = [];
    for (const v of images) {
        req.push({
            groupCode:      group_id,
            srcUin:         this.uin,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            picType:        1000,
            buildVer:       this.apkver,
            appPicType:     1006,
            fileIndex:      BUF0,
            transferUrl:    BUF0,
        });
    }
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  1,
        msgTryUpImgReq: req,
        extension: BUF0,
    });
    const blob = await this.sendUNI("ImgStore.GroupPicUp", body);
    return pb.decode("D388RespBody", blob);
}

async function offPicUp(user_id, images) {
    const req = [];
    for (const v of images) {
        req.push({
            srcUin:         this.uin,
            dstUin:         user_id,
            fileMd5:        v.md5,
            fileSize:       v.size,
            srcTerm:        5,
            platformType:   9,
            buType:         1,
            imgOriginal:    1,
            imgType:        1000,
            buildVer:       this.apkver,
            srvUpload:      1,
        });
    }
    const body = pb.encode("OffPicUpReqBody", {
        subcmd:  1,
        msgTryUpImgReq: req
    });
    const blob = await this.sendUNI("LongConn.OffPicUp", body);
    return pb.decode("OffPicUpRspBody", blob);
}

async function uploadImages(target, images, is_group) {
    let resp = await (is_group?imageStore:offPicUp).call(this, target, images);
    for (let i = 0; i < images.length; ++i) {
        const v = resp.msgTryUpImgRsp[i];
        if (v.boolFileExit || !images[i].buf) continue;
        const index = i % v.uint32UpIp.length;
        v.md5 = images[i].md5, v.buf = images[i].buf, v.key = v.upUkey;
        await highwayUpload.call(this, v.uint32UpIp[index], v.uint32UpPort[index], v, is_group?2:1);
    }
    return resp;
}

/**
 * @this {import("./ref").Client}
 * @param {Number} target 
 * @param {Buffer} buf 
 * @param {Buffer} md5 
 * @param {0|1} codec 
 * @returns {Promise<Buffer>} fid
 */
async function uploadPtt(target, buf, md5, codec) {
    const body = pb2.encode({
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
            10: this.apkver,
            12: 1,
            13: 1,
            14: codec,
            15: 1,
        }],
    });
    const blob = await this.sendUNI("PttStore.GroupPttUp", body);
    const rsp = pb2.decode(blob)[5];
    if (!rsp[4]) {
        const ip = Array.isArray(rsp[5])?rsp[5][0]:rsp[5],
            port = Array.isArray(rsp[6])?rsp[6][0]:rsp[6];
        const ukey = rsp[7].raw.toString("hex"), filekey = rsp[11].raw.toString("hex");
        const params = {
            ver: 4679, ukey, filekey,
            filesize: buf.length, bmd5: md5.toString("hex"),
            mType: "pttDu", voice_encodec: codec
        }
        const url = `http://${int32ip2str(ip)}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": `QQ/${this.apkver} CFNetwork/1126`,
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
 * @this {import("./ref").Client}
 * @param {Number} target 
 * @param {Buffer} compressed 
 * @param {Number} bu 
 * @returns {Promise<Buffer>} resid
 */
async function uploadMultiMsg(target, compressed, bu) {
    const body = pb2.encode({
        1: 1,
        2: 5,
        3: 9,
        4: 3,
        5: this.apkver,
        6: [{
            1: target,
            2: compressed.length,
            3: common.md5(compressed),
            4: 3,
            5: 0,
        }],
        8: bu,
        9: 0,
    });
    const blob = await this.sendUNI("MultiMsg.ApplyUp", body);
    const rsp = pb2.decode(blob)[2];
    if (rsp[1] > 0)
        throw new Error();
    const buf = pb2.encode({
        1: 1,
        2: 5,
        3: 9,
        4: [{
            1: 3,
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
 * @this {import("./ref").Client}
 * @param {Buffer} resid 
 * @param {Number} bu 
 * @returns {Promise<Buffer>}
 */
async function downloadMultiMsg(resid, bu) {
    const body = pb2.encode({
        1: 2,
        2: 5,
        3: 9,
        4: 3,
        5: this.apkver,
        7: [{
            1: resid,
            2: 3,
        }],
        8: bu,
        9: 2,
    });
    const blob = await this.sendUNI("MultiMsg.ApplyDown", body);
    const rsp = pb2.decode(blob)[3];
    const ip = int32ip2str(Array.isArray(rsp[4])?rsp[4][0]:rsp[4]),
        port = Array.isArray(rsp[5])?rsp[5][0]:rsp[5];
    let url = port == 443 ? "https://ssl.htdata.qq.com" : `http://${ip}:${port}`;
    url += rsp[2].raw;
    const headers = {
        "User-Agent": `QQ/${this.apkver} CFNetwork/1126`,
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
                    buf = pb2.decode(buf)[3];
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

async function getGroupFileUrl(group_id, bus_id, file_id) {
    const body = pb2.encode({
        3: {
            1: group_id,
            2: 3,
            3: bus_id,
            4: file_id,
        }
    });
    const blob = await this.sendUNI("OidbSvc.0x6d6_2", body);
    return pb2.decode(blob)[4][3];
}

module.exports = {
    uploadImages, uploadPtt, uploadMultiMsg, downloadMultiMsg, getGroupFileUrl
}
