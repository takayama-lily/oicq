"use strict";
const pb = require("../pb");

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
    const blob = await this.sendUNI("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_DOWNLOAD-1200", body);
    const rsp = pb.decode(blob)[14][30];
    let url = String(rsp[50].raw);
    if (!url.startsWith("http"))
        url = `http://${rsp[30].raw}:${rsp[40]}` + url;
    return url;
}

module.exports = {
    getGroupFileUrl, getC2CFileUrl,
};
