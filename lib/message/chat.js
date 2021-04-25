/**
 * 消息相关api入口
 * 发送，撤回，获取聊天记录，获取转发消息
 */
"use strict";
const { Builder } = require("./builder");
const { getC2CMsgs, getGroupMsgs, getLastSeq } = require("./history");
const { parseC2CMsg, parseGroupMsg, parseForwardMsg } = require("./parser");
const common = require("../common");
const pb = require("../pb");
const { parseC2CMessageId, parseGroupMessageId, genMessageUuid, genRandom } = common;
const { ImageBuilder, uploadImages, buildImageFileParam } = require("./image");

//send msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {number} group_id 
 * @param {number} user_id 
 * @param {import("../ref").MessageElem[]|String} message 
 * @param {boolean} escape 
 * @returns {import("../ref").ProtocolResponse}
 */
function sendTempMsg(group_id, user_id, message, escape) {
    [group_id, user_id] = common.uinAutoCheck(group_id, user_id);
    const builder = new Builder(this, user_id, 0);
    builder.routing = pb.encode({
        3: {
            1: common.code2uin(group_id),
            2: user_id,
        }
    });
    return builder.buildAndSend(message, escape);
}

/**
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {import("../ref").MessageElem[]|String} message 
 * @param {boolean} escape 
 * @param {0|1|2} type //0私聊 1群聊 2讨论组
 * @returns {import("../ref").ProtocolResponse}
 */
function sendMsg(target, message, escape, type) {
    [target] = common.uinAutoCheck(target);
    const builder = new Builder(this, target, type);
    return builder.buildAndSend(message, escape);
}

//recall----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 * @returns {import("../ref").ProtocolResponse}
 */
async function recallMsg(message_id) {
    let body;
    try {
        if (message_id.length > 24)
            body = _buildRecallGroupMsgBody.call(this, message_id);
        else
            body = _buildRecallPrivateMsgBody.call(this, message_id);
    } catch {
        throw new Error("incorrect message_id");
    }
    const blob = await this.sendUni("PbMessageSvc.PbMsgWithDraw", body);
    const rsp = pb.decode(blob);
    if (rsp[1]) {
        return { result: rsp[1][1] > 2 ? rsp[1][1] : 0 };
    } else if (rsp[2]) {
        return { result: rsp[2][1], emsg: String(rsp[2][2].raw) };
    }
}
function _buildRecallPrivateMsgBody(message_id) {
    const { user_id, seq, random, time } = parseC2CMessageId(message_id);
    let type = 0;
    try {
        if (this.sl.get(user_id).group_id)
            type = 1;
    } catch (e) { }
    return pb.encode({
        1: [{
            1: [{
                1: this.uin,
                2: user_id,
                3: seq,
                4: genMessageUuid(random),
                5: time,
                6: random,
            }],
            2: 0,
            3: Buffer.from([0x8, type]),
            4: 1,
        }]
    });
}
function _buildRecallGroupMsgBody(message_id) {
    var { group_id, seq, random, pktnum } = parseGroupMessageId(message_id);
    if (pktnum > 1) {
        //分片消息
        var msg = [], pb_msg = [], n = pktnum, i = 0;
        while (n-- > 0) {
            msg.push(pb.encode({
                1: seq,
                2: random,
            }));
            pb_msg.push(pb.encode({
                1: seq,
                3: pktnum,
                4: i++
            }));
            ++seq;
        }
        var reserver = {
            1: 1,
            2: pb_msg,
        };
    } else {
        var msg = {
            1: seq,
            2: random,
        };
        var reserver = { 1: 0 };
    }
    return pb.encode({
        2: [{
            1: 1,
            2: 0,
            3: group_id,
            4: msg,
            5: reserver,
        }]
    });
}

//get history msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {string} message_id 
 * @returns {import("../ref").ProtocolResponse}
 */
async function getOneMsg(message_id) {
    const ret = await getMsgs.call(this, message_id, 1);
    if (ret.data && ret.data.length)
        return { result: 0, data: ret.data[0] };
    else
        return { result: -1, emsg: "msg not exists" };
}

/**
 * 获取从message_id(包括自身)往前的count条消息
 * @this {import("../ref").Client}
 * @param {string} message_id 
 * @param {number} count 
 * @returns {import("../ref").ProtocolResponse}
 */
async function getMsgs(message_id, count = 20) {

    if (count > 20)
        count = 20;

    /**
     * @type {import("../ref").Msg[]}
     */
    let msgs, data = [];
    if (message_id.length > 24) {
        let { group_id, seq } = parseGroupMessageId(message_id);
        if (!seq)
            seq = await getLastSeq.call(this, group_id);
        let from_seq = seq - count + 1;
        if (from_seq <= 0)
            from_seq = 1;
        msgs = await getGroupMsgs.call(this, group_id, from_seq, seq);
        // todo 分片处理
        for (let msg of msgs) {
            try {
                data.push(Object.assign(this.parseEventType("message.group"), await parseGroupMsg.call(this, msg)));
            } catch { }
        }
    } else {
        let { user_id, time, random } = parseC2CMessageId(message_id);
        msgs = await getC2CMsgs.call(this, user_id, time ? time + 1 : common.timestamp(), count);
        for (let i = msgs.length - 1; i >= 0; --i) {
            try {
                const msg = msgs[i];
                if (time && genRandom(msg[1][7]) !== random && !data.length)
                    continue;
                data.unshift(Object.assign(this.parseEventType("message.private"), await parseC2CMsg.call(this, msg)));
            } catch { }
        }
    }
    return { result: 0, data };
}

/**
 * 获取转发消息
 * @this {import("../ref").Client}
 * @param {string} resid 
 * @returns {import("../ref").ProtocolResponse}
 */
function getForwardMsg(resid) {
    return parseForwardMsg.call(this, resid);
}

/**
 * 获取漫游表情
 * @this {import("../ref").Client}
 * @returns {import("../ref").ProtocolResponse}
 */
async function getRoamingStamp(no_cache = false) {
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
            return { result, emsg: String(rsp[2].raw) };
        }
        if (rsp[4][1]) {
            const bid = String(rsp[4][3].raw);
            const faces = Array.isArray(rsp[4][1]) ? rsp[4][1] : [rsp[4][1]];
            this.roaming_stamp = faces.map(x => `https://p.qpic.cn/${bid}/${this.uin}/${String(x.raw)}/0`);
        }
    }
    return {
        result: 0,
        data: this.roaming_stamp,
    };
}

/**
 * 提前上传图片以备发送
 * @this {import("../ref").Client}
 * @param {import("../ref").MediaFile[]} files 
 * @returns {import("../ref").ProtocolResponse}
 */
async function preloadImages(files = []) {
    // if (typeof files[Symbol.iterator] !== "function" || typeof files === "string") {
    //     files = [files];
    // }
    const imgs = [];
    const tasks = [];
    for (let file of files) {
        const img = new ImageBuilder(this, true);
        await img.buildNested({ file });
        if (!img.nested)
            continue;
        imgs.push(img);
        if (img.task) {
            tasks.push(img.task);
        }
    }
    await Promise.all(tasks);
    await uploadImages.call(this, this.uin, imgs, true);
    const data = [];
    for (let img of imgs) {
        data.push(buildImageFileParam(img.md5, img.size, img.width, img.height, img.type));
    }
    return {
        result: 0, data
    };
}

module.exports = {
    sendMsg, sendTempMsg, recallMsg,
    getOneMsg, getMsgs, getForwardMsg,
    getRoamingStamp, preloadImages
};
