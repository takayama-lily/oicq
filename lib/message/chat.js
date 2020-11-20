"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const Builder = require("./builder");
const {uploadMultiMsg} = require("./storage");
const common = require("../common");
const pb = require("../pb");
const {genC2CMessageId, parseC2CMessageId, parseGroupMessageId} = common;

//send msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {Number} target 
 * @param {import("../../client").MessageElem[]|String} message 
 * @param {Boolean} escape 
 * @param {0|1|2} type 
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendMsg(target, message, escape, type) {
    var [target] = common.uinAutoCheck(target);
    const builder = new Builder(this, target, type);
    await builder.exec(message, escape);

    const _sendMsg = async(rich, long = false)=>{
        if (long)
            rich[2] = await toLongMessageElems.call(this, target, rich, type);
        if (builder.anon) {
            if (!rich[2])
                rich[2] = [];
            rich[2].push(builder.anon);
        }
        ++this.stat.sent_msg_cnt;
        return await (type?sendGroupMsg:sendPrivateMsg).call(this, target, rich, type);
    }

    let rsp;
    for (const buf of builder.b77) {
        ++this.stat.sent_msg_cnt;
        rsp = await sendB77RichMsg.call(this, buf);
    }
    for (const elem of builder.ptts) {
        rsp = await _sendMsg({4: elem});
    }
    for (const elems of builder.flashs.concat(builder.jsons, builder.xmls)) {
        rsp = await _sendMsg({2: elems});
    }

    if (!builder.length) {
        if (rsp) return rsp;
        throw new Error("empty message");
    }
    rsp = await _sendMsg({2: builder.elems}, builder.isLong());
    if (this.config.resend && !builder.isLong() && rsp.data && rsp.data.message_id === "" && !builder.anon) {
        this.logger.warn(`此消息将尝试以另一种方式再发送一次。`);
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
            if (v.has(user_id))
                routing = {3: {
                    1: common.code2uin(k),
                    2: user_id,
                }}
        }
    }
    const seq = this.seq_id;
    const random = crypto.randomBytes(4).readUInt32BE();
    const body = pb.encode({
        1: routing,
        2: {1:1, 2:0, 3:0},
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
    var emsg = rsp[2] ? String(rsp[2].raw) : undefined;
    this.logger.error(`send failed: [Private: ${user_id}] ` + emsg);
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
        2: {1:1, 2:0, 3:0},
        3: {1: rich},
        4: this.seq_id + 1,
        5: random,
        8: 0,
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
    const rsp = pb.decode(blob);
    if (rsp[1] !== 0) {
        this.removeAllListeners(event_id);
        if (rsp[1] === 120)
            var emsg = "发送失败，在本群被禁言";
        else
            var emsg = rsp[2] ? String(rsp[2].raw) : undefined;
        this.logger.error(`send failed: [Group: ${target}] ` + emsg);
        return {result: rsp[1], emsg};
    }
    if (type === 2) {
        this.removeAllListeners(event_id);
        return {result: rsp[1]};
    }
    if (!message_id) {
        await new Promise((resolve)=>{
            setTimeout(()=>{
                this.removeAllListeners(event_id);
                resolve();
            }, 500);
        });
    }
    this.logger.info(`send to: [Group: ${target} / message_id: ${message_id}]`);
    if (!message_id)
        this.logger.warn("生成message_id失败，此消息大概率被风控了。");
    return {result: 0, data: {message_id}};
}

/**
 * @this {import("../ref").Client}
 * @returns {Array}
 */
async function toLongMessageElems(uin, rich, is_group) {
    const compressed = zlib.gzipSync(pb.encode({
        1: {
            1: {
                1: this.uin,
                3: is_group?82:9,
                4: 11,
                5: crypto.randomBytes(2).readUInt16BE(),
                6: common.timestamp(),
                9: {
                    1: uin,
                    4: this.nickname,
                },
                14: this.nickname,
                20: {
                    1:0,
                    2:1
                },
            },
            3: {
                1: rich,
            },
        },
    }));
    try {
        var resid = await uploadMultiMsg.call(this, uin, compressed);
    } catch (e) {
        throw new Error("fail to upload multi msg");
    }
    const templete = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<msg serviceID="35" templateID="1" action="viewMultiMsg"
        brief="[图文消息]"
        m_resid="${resid}"
        m_fileName="${common.timestamp()}" sourceMsgId="0" url=""
        flag="3" adverSign="0" multiMsgFlag="1">
    <item layout="1">
        <title>[图文消息]</title>
        <hr hidden="false" style="0"/>
        <summary>点击查看完整消息</summary>
    </item>
    <source name="聊天记录" icon="" action="" appid="-1"/>
</msg>`;
    return [
        {
            12: {
                1: Buffer.concat([Buffer.from([1]), zlib.deflateSync(templete)]),
                2: 35,
            }
        },
        {
            1: {
                1: "你的QQ暂不支持查看[转发多条消息]，请期待后续版本。",
            }
        },
        {
            37: {
                6: 1,
                7: resid,
                17: 0,
                19: {
                    15: 0,
                    31: 0,
                    41: 0
                },
            }
        },
    ];
}

/**
 * @this {import("../ref").Client}
 */
async function sendB77RichMsg(buf) {
    try {
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
    if (message_id.length > 24)
        body = buildRecallGroupMsgBody.call(this, message_id);
    else
        body = buildRecallPrivateMsgBody.call(this, message_id);
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
                4: 16777216n<<32n|BigInt(random),
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
    const {group_id, seq, random} = parseGroupMessageId(message_id);
    return pb.encode({
        2: [{
            1: 1,
            3: group_id,
            4: [{
                1: seq,
                2: random,
                3: 0,
            }],
            5: Buffer.from([8,0]),
        }]
    });
}

module.exports = {
    sendMsg, recallMsg, buildSyncCookie
};
