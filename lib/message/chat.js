"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const {Builder} = require("./builder");
const {getC2CMsg, getGroupMsg} = require("./history");
const {parsePrivateMsg, parseGroupMsg} = require("./recv");
const {highwayUpload} = require("../service");
const common = require("../common");
const pb = require("../pb");
const {genC2CMessageId, parseC2CMessageId, parseGroupMessageId, genMessageUuid} = common;
const BUF1 = Buffer.from([1]);
const PB_CONTENT = pb.encode({1:1, 2:0, 3:0});
const PB_RESERVER = pb.encode({
    17: 0,
    19: {
        15: 0,
        31: 0,
        41: 0
    },
});

//send msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {Number} target 
 * @param {import("../../client").MessageElem[]|String} message 
 * @param {Boolean} escape 
 * @param {0|1|2} type //0私聊 1群聊 2讨论组
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendMsg(target, message, escape, type) {
    var [target] = common.uinAutoCheck(target);
    const builder = new Builder(this, target, type);
    await builder.exec(message, escape);

    const _sendMsg = async(rich, frag = false)=>{
        if (builder.anon) {
            if (!rich[2])
                rich[2] = [];
            rich[2].push(builder.anon);
        }
        ++this.stat.sent_msg_cnt;
        if (frag && rich[2] && type === 1) {
            rich[2].pop();
            return await sendGroupMsgByFrag.call(this, target, toFragments(rich[2]));
        } else {
            if (rich[2]) {
                rich[2].push({
                    37: PB_RESERVER
                });
            }
            return await (type?sendGroupMsg:sendPrivateMsg).call(this, target, rich, type);
        }
    }

    let rsp;
    for (const buf of builder.b77) {
        rsp = await sendB77RichMsg.call(this, buf);
    }
    for (const elem of builder.ptts) {
        rsp = await _sendMsg({4: elem});
    }
    for (const elems of builder.flashs.concat(builder.jsons, builder.xmls)) {
        rsp = await _sendMsg({2: elems});
    }

    if (builder.nodes.length > 0) {
        const elems = await toForwardMsgElems.call(this, target, builder.nodes);
        rsp = await _sendMsg({2: elems});
    }

    if (!builder.length) {
        if (rsp) return rsp;
        throw new Error("empty message");
    }
    rsp = await _sendMsg({2: builder.elems});
    if (this.config.resend && rsp.data && rsp.data.message_id === "") {
        if (builder.stat.length <= 100) {
            const emsg = "群消息发送失败，可能包含奇怪的内容所导致";
            this.logger.error(`send failed: [Group: ${target}] ` + emsg);
            return {result: -1, emsg};
        }
        this.logger.warn(`此消息将尝试使用分片发送。`);
        return await _sendMsg({2: builder.elems}, true);
    }
    return rsp;
}

function buildSyncCookie() {
    const time = common.timestamp();
    return pb.encode({
        1: time,
        2: time,
        3: this.const1,
        4: this.const2,
        5:  crypto.randomBytes(4).readUInt32BE(),
        9:  crypto.randomBytes(4).readUInt32BE(),
        11: crypto.randomBytes(4).readUInt32BE(),
        12: this.const3,
        13: time,
        14: 0,
    });
}

/**
 * @this {import("../ref").Client}
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendPrivateMsg(user_id, rich) {
    let routing = {1: {1: user_id}};
    if (this.sl.has(user_id)) {
        try {
            const group_id = this.sl.get(user_id).group_id;
            if ((await this.getGroupMemberInfo(group_id, user_id)).data)
                routing = {3: {
                    1: common.code2uin(group_id),
                    2: user_id,
                }};
        } catch (e) {}
    } else if (!this.fl.has(user_id)) {
        for (const [k, v] of this.gml) {
            if (v instanceof Map && v.has(user_id)) {
                routing = {3: {
                    1: common.code2uin(k),
                    2: user_id,
                }}
                break;
            }
        }
    }
    const seq = this.seq_id;
    const random = crypto.randomBytes(4).readUInt32BE();
    const body = pb.encode({
        1: routing,
        2: PB_CONTENT,
        3: {1: rich},
        4: seq,
        5: random,
        6: buildSyncCookie.call(this),
        8: 1,
    });
    const blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    const rsp = pb.decode(blob);
    if (rsp[1] === 0) {
        const message_id = genC2CMessageId(user_id, seq, random, rsp[3]);
        this.logger.info(`send to: [Private: ${user_id} / message_id: ${message_id}]`);
        return {result: 0, data: {message_id}};
    }
    let emsg = rsp[2] ? String(rsp[2].raw) : "";
    this.logger.error(`send failed: [Private: ${user_id}] ${emsg}(${rsp[1]})`);
    return {result: rsp[1], emsg};
}

/**
 * @this {import("../ref").Client}
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendGroupMsg(target, rich, type) {
    const routing = type === 1 ? {2: {1: target}} : {4: {1: target}};
    const random = crypto.randomBytes(4).readUInt32BE();
    const body = pb.encode({
        1: routing,
        2: PB_CONTENT,
        3: {1: rich},
        4: this.seq_id + 1,
        5: random,
        8: 0
    });
    const event_id = `interval.${target}.${random}`;
    let message_id = "";
    this.once(event_id, (id)=>message_id=id);
    try {
        var blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    } catch (e) {
        this.removeAllListeners(event_id);
        throw e;
    }
    this.removeAllListeners(event_id);
    const rsp = pb.decode(blob);
    if (rsp[1] !== 0) {
        let emsg = rsp[2] ? String(rsp[2].raw) : "";
        this.logger.error(`send failed: [Group: ${target}] ${emsg}(${rsp[1]})`);
        return {result: rsp[1], emsg};
    }
    if (type === 2) {
        return {result: rsp[1]};
    }
    if (!message_id) {
        await new Promise((resolve)=>{
            const timeout = setTimeout(()=>{
                this.removeAllListeners(event_id);
                resolve();
            }, this.config.resend?500:5000);
            this.once(event_id, (id)=>{
                message_id = id;
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    this.logger.info(`send to: [Group: ${target} / message_id: ${message_id}]`);
    if (!message_id)
        this.logger.warn("生成message_id失败，此消息大概率被风控了。");
    return {result: 0, data: {message_id}};
}

/**
 * @this {import("../ref").Client}
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendGroupMsgByFrag(group_id, fragments) {
    const routing = {2: {1: group_id}};
    let n = 0;
    const random = crypto.randomBytes(4).readUInt32BE();
    const div = crypto.randomBytes(2).readUInt16BE();
    for (let fragment of fragments) {
        const body = pb.encode({
            1: routing,
            2: {
                1: fragments.length,
                2: n,
                3: div
            },
            3: {1: {2: fragment}},
            4: this.seq_id + 1,
            5: random,
            8: 0,
        });
        ++n;
        this.writeUNI("MessageSvc.PbSendMsg", body);
    }
    const event_id = `interval.${group_id}.${random}`;
    let message_id = "";
    await new Promise((resolve)=>{
        const timeout = setTimeout(()=>{
            this.removeAllListeners(event_id);
            resolve();
        }, 3000);
        this.once(event_id, (id)=>{
            message_id = id;
            clearTimeout(timeout);
            resolve();
        });
    });
    if (!message_id) {
        const emsg = "群分片消息发送失败，可能包含奇怪的内容所导致";
        this.logger.error(`send failed: [Group: ${group_id}] ` + emsg);
        return {result: -1, emsg};
    }
    this.logger.info(`send to: [Group: ${group_id} / message_id: ${message_id}]`);
    return {result: 0, data: {message_id}};
}

function toFragments(elems) {
    const fragments = [];
    let fragment = [];
    for (let elem of elems) {
        fragment.push(elem);
        if (elem[1] && !elem[1][3]) { //1:text 1[3]:at
            fragment.push({
                37: PB_RESERVER
            });
            fragments.push(fragment);
            fragment = [];
        }
    }
    if (fragment.length > 0) {
        fragment.push({
            37: PB_RESERVER
        });
        fragments.push(fragment);
    }
    return fragments;
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer[]} nodes 
 */
async function toForwardMsgElems(target, nodes) {
    const compressed = zlib.gzipSync(pb.encode({
        1: nodes,
        2: {
            1: "MultiMsg",
            2: {
                1: nodes
            }
        }
    }));
    try {
        var resid = await uploadMultiMsg.call(this, target, compressed);
    } catch (e) {
        throw new Error("failed to upload forward msg");
    }
    const preview = ` <title color="#000000" size="26" > 转发的聊天记录 </title>`;
    const template = `<?xml version="1.0" encoding="utf-8"?>
    <msg brief="[聊天记录]" m_fileName="${common.uuid().toUpperCase()}" action="viewMultiMsg" tSum="2" flag="3" m_resid="${resid}" serviceID="35" m_fileSize="${compressed.length}"  > <item layout="1"> <title color="#000000" size="34" > 转发的聊天记录 </title>${preview}  <hr></hr> <summary color="#808080" size="26" > 查看转发消息  </summary> </item><source name="聊天记录"></source> </msg>`;
    return [
        {
            12: {
                1: Buffer.concat([BUF1, zlib.deflateSync(template)]),
                2: 35,
            },
        },
        {
            37: PB_RESERVER
        },
    ];
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
 */
async function sendB77RichMsg(buf) {
    try {
        ++this.stat.sent_msg_cnt;
        await this.sendUNI("OidbSvc.0xb77_9", buf);
    } catch {}
    return {result: 0, data: {message_id: ""}};
}

//recall----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 */
async function recallMsg(message_id) {
    let body;
    try {
        if (message_id.length > 24)
            body = buildRecallGroupMsgBody.call(this, message_id);
        else
            body = buildRecallPrivateMsgBody.call(this, message_id);
    } catch {
        throw new Error("incorrect message_id");
    }
    await this.sendUNI("PbMessageSvc.PbMsgWithDraw", body);
}
function buildRecallPrivateMsgBody(message_id) {
    const {user_id, seq, random, time} = parseC2CMessageId(message_id);
    let type = 0;
    try {
        if (this.sl.get(user_id).group_id)
            type = 1;
    } catch (e) {}
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
            3: Buffer.from([0x8,type]),
            4: 1,
        }]
    });
}
function buildRecallGroupMsgBody(message_id) {
    var {group_id, seq, random, pktnum} = parseGroupMessageId(message_id);
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
        }
    } else {
        var msg = {
            1: seq,
            2: random,
        };
        var reserver = {1: 0};
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
 */
async function getHistoryMsg(message_id) { 
    if (message_id.length > 24) {
        const o = await getGroupMsg.call(this, message_id);
        try {
            const msg = await parseGroupMsg.call(this, o[1], o[2], o[3], false);
            msg.message_type = "group";
            msg.real_id = message_id;
            return {result: 0, data: msg};
        } catch (e) {
            this.logger.debug(e);
            return {result: -1, emsg: "failed to get group msg"};
        }
    } else {
        const o = await getC2CMsg.call(this, message_id);
        try {
            const msg = await parsePrivateMsg.call(this, o[1][3], o[1], o[2], o[3]);
            msg.message_type = "private";
            msg.real_id = message_id;
            return {result: 0, data: msg};
        } catch (e) {
            this.logger.debug(e);
            return {result: -1, emsg: "failed to get c2c msg"};
        }
    }
}

module.exports = {
    sendMsg, recallMsg, buildSyncCookie, getHistoryMsg
};
