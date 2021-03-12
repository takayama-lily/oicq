/**
 * 群文件、离线文件相关
 */
"use strict";
const pb = require("../pb");

/**
 * @this {import("../ref").Client}
 * @param {number}} group_id 
 * @param {number} busid 
 * @param {Buffer|string} fileid 
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
    const blob = await this.sendOidb("OidbSvc.0x6d6_2", body);
    return pb.decode(blob)[4][3];
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer|string} fileid 
 */
async function getC2CFileUrl(fileid) {
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
    const blob = await this.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_DOWNLOAD-1200", body);
    const rsp = pb.decode(blob)[14][30];
    let url = String(rsp[50].raw);
    if (!url.startsWith("http"))
        url = `http://${rsp[30].raw}:${rsp[40]}` + url;
    return url;
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Proto} elem 
 */
async function getVideoUrl(elem) {
    const body = pb.encode({
        1: 400,
        4: {
            1: this.uin,
            2: this.uin,
            3: 1,
            4: 7,
            5: elem[1],
            6: 1,
            8: elem[2],
            9: 1,
            10: 2,
            11: 2,
            12: 2,
        }
    });
    const blob = await this.sendUni("PttCenterSvr.ShortVideoDownReq", body);
    const o = pb.decode(blob)[4][9];
    return (Array.isArray(o[10]) ? o[10][1].raw : o[10].raw) + String(o[11].raw);
}

module.exports = {
    getGroupFileUrl, getC2CFileUrl, getVideoUrl
};
