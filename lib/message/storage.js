"use strict";
const zlib = require("zlib");
const http = require("http");
const https = require("https");
const {highwayUpload, int32ip2str} = require("../service");
const querystring = require("querystring");
const tea = require("crypto-tea");
const pb = require("../pb");
const common = require("../common");
const BUF0 = Buffer.alloc(0);

/**
 * @param {object[]} images
 *  @field {Buffer} md5
 *  @field {Number} size
 */
async function imageStore(group_id, images) {
    this.nextSeq();
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
    this.nextSeq();
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

// async function uploadC2CPtt(user_id, ptt) {
//     this.nextSeq();
//     const req = [];
//     req.push({
//         srcUin:         this.uin,
//         toUin:          user_id,
//         type:           2,
//         voiceLength:    1,
//         fileName:       ptt.md5.toString() + ".amr",
//         md5:            ptt.md5
//     });
//     const body = pb.encode("TryUpC2CPtt", {
//         subcmd: 500,
//         result: 0,
//         msgTryUpPtt: req,
//         a806: 17,
//         b006: 104,
//         sub99999: {
//             k1: 3,
//             k2: 0,
//             k300: 1,
//             k500: 3,
//             k600: 2,
//             k800: 2,
//         }
//     });
//     const blob = await this.sendUNI("PttCenterSvr.pb_pttCenter_CMD_REQ_APPLY_UPLOAD-500", body);
//     const resp = pb.decode("TryUpC2CPtt", blob);
//     return resp.msgTryUpPtt[0];
// }

async function uploadGroupPtt(group_id, ptt) {
    this.nextSeq();
    const req = [];
    req.push({
        groupCode:      group_id,
        srcUin:         this.uin,
        fileMd5:        ptt.md5,
        fileSize:       ptt.size,
        fileName:       ptt.md5,
        fileId:         0,
        srcTerm:        5,
        platformType:   9,
        buType:         4,
        innerIp:        0,
        buildVer:       this.apkver,
        voiceLength:    1,
        codec:          ptt.ext===".amr"?0:1,
        voiceType:      1,
        boolNewUpChan:  true,
    });
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  3,
        msgTryUpPttReq: req,
    });
    const blob = await this.sendUNI("PttStore.GroupPttUp", body);
    const resp = pb.decode("D388RespBody", blob);
    return resp.msgTryUpPttRsp[0];
}

async function uploadPtt(target, ptt, is_group) {
    if (!is_group)
        target = 1;
    const resp = await uploadGroupPtt.call(this, target, ptt);
    if (!resp.boolFileExit) {
        const ip = int32ip2str(resp.uint32UpIp[0]), port = resp.uint32UpPort[0];
        const ukey = resp.upUkey.toString("hex"), filekey = resp.fileKey.toString("hex");
        const params = {
            ver: 4679, ukey, filekey,
            filesize: ptt.size, bmd5: ptt.md5.toString("hex"),
            mType: "pttDu", voice_encodec: ptt.ext===".amr"?0:1
        }
        const url = `http://${ip}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": `QQ/${this.apkver} CFNetwork/1126`,
            "Net-Type": "Wifi"
        };
        await new Promise((resolve)=>{
            http.request(url, {method: 'POST', headers}, resolve)
                .on("error", resolve)
                .end(ptt.buf);
        })
    }
    return resp;
}

// async function downloadPtt(md5, key) {
//     this.nextSeq();
//     const req = [];
//     req.push({
//         groupCode:      179763449,
//         srcUin:         this.uin,
//         fileId:         2061878809,
//         fileMd5:        md5,
//         reqTerm:        5,
//         reqPlatformType:9,
//         innerIp:        0,
//         buType:         3,
//         buildVer:       this.apkver,
//         fileKey:        key,
//         codec:          1,
//         isAuto:         1,
//     });
//     common.log(req)
//     const body = pb.encode("D388ReqBody", {
//         netType: 3,
//         subcmd:  4,
//         msgGetPttReq: req,
//     });
//     const blob = await this.sendUNI("PttStore.GroupPttDown", body);
//     const resp = pb.decode("D388RespBody", blob);
//     common.log(resp)
//     return resp.msgGetPttUrlRsp[0];
// }

async function uploadMultiMsg(target, msg, bu) {
    this.nextSeq();
    const compressed = zlib.gzipSync(pb.encode("PbMultiMsgTransmit", {
        msg, pbItemList: [{
            fileName: "MultiMsg",
            buffer:   pb.encode("PbMultiMsgNew", {msg}),
        }]
    }));
    const body = pb.encode("MultiReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       this.apkver,
        buType:         bu,
        reqChannelType: 0,
        multimsgApplyupReq: [{
            applyId:    0,
            dstUin:     target,
            msgSize:    compressed.length,
            msgMd5:     common.md5(compressed),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyUp", body);
    let resp = pb.decode("MultiRspBody", blob);
    resp = resp.multimsgApplyupRsp[0];
    if (resp.result > 0)
        throw new Error();
    const buf = pb.encode("LongReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        msgUpReq:       [{
            msgType:    3,
            dstUin:     target,
            msgContent: compressed,
            storeType:  2,
            msgUkey:    resp.msgUkey,
        }],
    });
    const o = {
        buf: buf,
        md5: common.md5(buf),
        key: resp.msgSig
    }
    await highwayUpload.call(this, resp.uint32UpIp[0], resp.uint32UpPort[0], o, 27);
    return resp;
}

async function downloadMultiMsg(resid, bu) {
    this.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         2,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       this.apkver,
        buType:         bu,
        reqChannelType: 2,
        multimsgApplydownReq: [{
            msgResid:   Buffer.from(resid),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyDown", body);
    let resp = pb.decode("MultiRspBody", blob);

    resp = resp.multimsgApplydownRsp[0];
    const ip = int32ip2str(resp.uint32DownIp[0]), port = resp.uint32DownPort[0];
    let url = port == 443 ? "https://ssl.htdata.qq.com" : `http://${ip}:${port}`;
    url += String(resp.thumbDownPara);
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
                    buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), resp.msgKey);
                    buf = pb.decode("LongRspBody", buf);
                    buf = zlib.unzipSync(buf.msgDownRsp[0].msgContent);
                    resolve(pb.decode("PbMultiMsgTransmit", buf));
                } catch (e) {
                    reject();
                }
            })
        }).on("error", reject);
    });
}

async function getGroupFileUrl(group_id, bus_id, file_id) {
    this.nextSeq();
    const body = pb.encode("D6D6ReqBody", {
        downloadFileReq: {
            groupCode: group_id,
            appId:     3,
            busId:     bus_id,
            fileId:    file_id,
        }
    });
    const blob = await this.sendUNI("OidbSvc.0x6d6_2", body);
    return pb.decode("D6D6RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
}

module.exports = {
    uploadImages, uploadPtt, uploadMultiMsg, downloadMultiMsg, getGroupFileUrl
}
