"use strict";
const https = require("https");
const pb = require("../algo/pb");
const jce = require("../algo/jce");
const { uinAutoCheck } = require("../common");

/**
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @param {number} times 1~20
 * @returns {import("./ref").ProtocolResponse}
 */
async function sendLike(user_id, times = 1) {
    [user_id] = uinAutoCheck(user_id);
    times = parseInt(times);
    if (!(times > 0 && times <= 20))
        times = 1;
    const ReqFavorite = jce.encodeStruct([
        jce.encodeNested([
            this.uin, 1, this.seq_id + 1, 1, 0, Buffer.from("0C180001060131160131", "hex")
        ]),
        user_id, 0, 1, times
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "VisitorSvc",
        method: "ReqFavorite",
    };
    const body = jce.encodeWrapper({ ReqFavorite }, extra);
    const blob = await this.sendUni("VisitorSvc.ReqFavorite", body);
    const rsp = jce.decode(blob);
    return { result: rsp[0][3], emsg: rsp[0][4] };
}

/**
 * 设置在线状态
 * @this {import("./ref").Client}
 * @param {number} status 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setStatus(status) {
    status = parseInt(status);
    if (![11, 31, 41, 50, 60, 70].includes(status))
        throw new Error("bad status");
    let sub = 0;
    if (status > 1000) {
        sub = status, status = 11;
    }
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        7, 0, "", status, 0, 0, 0, 0, 0, 248,
        this.device.version.sdk, 0, "", 0, null, this.device.guid, 2052, 0, this.device.model, this.device.model,
        this.device.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
        "", "", null, 1, null, 0, null, sub, 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "PushService",
        method: "SvcReqRegister",
    };
    const body = jce.encodeWrapper({ SvcReqRegister }, extra);
    const blob = await this.sendUni("StatSvc.SetStatusFromClient", body);
    const rsp = jce.decode(blob);
    let result = -1;
    if (rsp[9]) {
        result = 0;
        this.online_status = status;
    }
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {number} user_id 
 * @returns {import("./ref").ProtocolResponse}
 */
async function getLevelInfo(user_id = this.uin) {
    [user_id] = uinAutoCheck(user_id);
    const cookie = (await this.getCookies("vip.qq.com")).data.cookies;
    const url = `https://club.vip.qq.com/api/vip/getQQLevelInfo?requestBody={"iUin":${user_id}}`;
    try {
        let data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { cookie } }, (res) => {
                if (res.statusCode !== 200) {
                    return reject("statusCode: " + res.statusCode);
                }
                res.setEncoding("utf-8");
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try {
                        data = JSON.parse(data);
                        if (data.ret !== 0) {
                            return reject(data.msg);
                        }
                        resolve(data.data.mRes);
                    } catch {
                        reject("response error");
                    }

                });
            }).on("error", (e) => reject(e.message));
        });
        return { result: 0, data };
    } catch (e) {
        return { result: -1, emsg: e };
    }
}

/**
 * 获取漫游表情
 * @this {import("../ref").Client}
 * @returns {import("../ref").ProtocolResponse}
 */
async function getRoamingStamp(no_cache = false) {
    if (!this.roaming_stamp)
        this.roaming_stamp = [];
    if (!this.roaming_stamp.length || no_cache) {
        const body = pb.encode({
            1: {
                1: 109,
                2: this.device.version.release,
                3: this.apk.ver
            },
            2: this.uin,
            3: 1,
        });
        const blob = await this.sendUni("Faceroam.OpReq", body);
        const rsp = pb.decode(blob);
        const result = rsp[1];
        if (result !== 0) {
            return { result, emsg: String(rsp[2]) };
        }
        if (rsp[4][1]) {
            const bid = String(rsp[4][3]);
            const faces = Array.isArray(rsp[4][1]) ? rsp[4][1] : [rsp[4][1]];
            this.roaming_stamp = faces.map(x => `https://p.qpic.cn/${bid}/${this.uin}/${x}/0`);
        }
    }
    return {
        result: 0,
        data: this.roaming_stamp,
    };
}

module.exports = {
    setStatus, sendLike, getLevelInfo, getRoamingStamp
};
