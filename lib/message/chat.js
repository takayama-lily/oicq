"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const buildMessage = require("./builder");
const parseMessage = require("./parser");
const {uploadImages, uploadMultiMsg} = require("./storage");
const common = require("../common");
const pb = require("../pb");
const pb2 = require("../pb2");

//send msg----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 * @param {Number} target 
 * @param {import("../../client").MessageElem[]|String} message 
 * @param {Boolean} escape 
 * @param {Number} type 
 * @returns {import("../ref").ProtocolResponse}
 */
async function sendMsg(target, message, escape, type) {
    var [target] = common.uinAutoCheck(target);

    const _sendMsg = async(rich, long = false)=>{
        if (long)
            rich[2] = await toLongMessageElems.call(this, type?common.code2uin(target):target, rich);
        return await (type?sendGroupMsg:sendPrivateMsg).call(this, target, rich, type);
    }

    const map = await buildMessage.call(this, message, escape, type===1?target:type);
    const elems = [], tasks = [], images = [];
    let stat, rsp;
    for (let [elem, o] of map) {
        if (o.task instanceof Promise)
            tasks.push(o.task);
        switch (o.type) {
            case "stat":
                stat = o;
                break;
            case "ptt":
                rsp = await _sendMsg({4: elem});
                break;
            case "flash":
                if (!o.done)
                    await completeImages.call(this, target, [elem[Object.keys(elem)[0]]], type);
                const flash = [
                    {53: {
                        1: 3,
                        2: pb.encode("MsgElemInfoServtype3", elem),
                        3: 0,
                    }},
                    {1: {1: "[闪照]请使用新版手机QQ查看闪照。"}}
                ];
                rsp = await _sendMsg({2: flash});
                break;
            case "json":
            case "xml":
                const rich = [elem];
                if (o.text)
                    rich.push({1: {1: o.text}});
                rsp = await _sendMsg({2: rich});
                break;
            default:
                elems.push(elem);
                if (o.type === "image" && !o.done)
                    images.push(elem[Object.keys(elem)[0]]);
        }
    }
    if (!elems.length) {
        if (rsp) return rsp;
        throw new Error("empty message");
    }
    await Promise.all(tasks);
    await completeImages.call(this, target, images, type);
    stat.length += stat.at_cnt * 22 + stat.face_cnt * 23 + stat.sface_cnt * 42 + stat.bface_cnt * 140 + stat.img_cnt * (type?90:304);
    stat.length *= 1.05;
    const is_long = type ? (stat.length>790) : (stat.length>935);
    rsp = await _sendMsg({2:elems}, is_long);
    if (!is_long && rsp.result === 0 && rsp.data && rsp.data.message_id === "") {
        this.logger.warn(`判定为风控，这条消息将尝试作为长消息再发送一次。`);
        return await _sendMsg({2:elems}, true);
    }
    return rsp;
}

function buildSyncCookie() {
    const time = common.timestamp();
    return pb2.encode({
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
    const seq = crypto.randomBytes(2).readUInt16BE();
    const random = crypto.randomBytes(2).readUInt16BE();
    const body = pb2.encode({
        1: routing,
        2: {1:1, 2:0, 3:0},
        3: {1: rich},
        4: seq,
        5: random,
        6: buildSyncCookie.call(this),
        8: 1,
    });
    const blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    const rsp = pb2.decode(blob);
    if (rsp[1] === 0) {
        const message_id = genSelfMessageId(user_id, seq, random, rsp[3]);
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
    const body = pb2.encode({
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
    let blob;
    try {
        blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    } catch (e) {
        this.removeAllListeners(event_id);
        throw e;
    }
    const rsp = pb2.decode(blob);
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
    return {result: 0, data: {message_id}};
}

async function completeImages(target, images, is_group) {
    let n = 0;
    while (images.length > n) {
        try {
            const resp = await uploadImages.call(this, target, images.slice(n, n + 20), is_group);
            for (let i = 0; i < resp.msgTryUpImgRsp.length; ++i) {
                const v = resp.msgTryUpImgRsp[i], nest = images[i];
                nest.fileId = nest.resId = nest.downloadPath = is_group ? v.fid.low : v.upResid;
            }
        } catch (e) {}
        n += 20;
    }
}

/**
 * @this {import("../ref").Client}
 * @returns {Array}
 */
async function toLongMessageElems(uin, rich) {
    const seq = crypto.randomBytes(2).readUInt16BE();
    const msg = pb2.encode({
        1: {
            1: this.uin,
            3: 82,
            5: seq,
            6: common.timestamp(),
            7: 0x01000000000000000n | BigInt(seq),
            20: {2:1},
            9: {
                1: common.uin2code(uin),
                4: this.nickname,
            },
        },
        3: {
            1: rich,
        },
    });
    const compressed = zlib.gzipSync(pb2.encode({
        1: [msg],
        2: [{
            1: "MultiMsg",
            2: {1: [msg]},
        }]
    }));
    try {
        var resid = await uploadMultiMsg.call(this, uin, compressed, 1);
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
            37: {
                6: 1,
                7: resid,
                19: Buffer.from([0x78, 0x00, 0xF8, 0x01, 0x00, 0xC8, 0x02, 0x00]),
            }
        },
    ];
}

function genSelfMessageId(user_id, seq, random, timestamp) {
    const buf = Buffer.allocUnsafe(12);
    buf.writeUInt32BE(user_id), buf.writeUInt16BE(seq, 4), buf.writeUInt16BE(random, 6), buf.writeUInt32BE(timestamp, 8);
    return "0" + buf.toString("base64");
}
function parseSelfMessageId(message_id) {
    const buf = Buffer.from(message_id.substr(1), "base64");
    const user_id = buf.readUInt32BE(), seq = buf.readUInt16BE(4), random = buf.readUInt16BE(6), timestamp = buf.readUInt32BE(8);
    return {user_id, seq, random, timestamp};
}
function genGroupMessageId(group_id, seq, random) {
    const buf = Buffer.allocUnsafe(12);
    buf.writeUInt32BE(group_id), buf.writeInt32BE(seq&0xffffffff, 4), buf.writeInt32BE(random&0xffffffff, 8);
    return "1" + buf.toString("base64");
}
function parseGroupMessageId(message_id) {
    const buf = Buffer.from(message_id.substr(1), "base64");
    const group_id = buf.readUInt32BE(), seq = buf.readUInt32BE(4), random = buf.readUInt32BE(8);
    return {group_id, seq, random};
}

//recall----------------------------------------------------------------------------------------------------

async function recallMsg(message_id) {
    let body;
    if (message_id[0] === "1")
        body = recallGroupMsg.call(this, message_id);
    else
        body = recallPrivateMsg.call(this, message_id);
    await this.sendUNI("PbMessageSvc.PbMsgWithDraw", body);
}
function recallPrivateMsg(message_id) {
    const {user_id, seq, random, timestamp} = parseSelfMessageId(message_id);
    let type = 0;
    try {
        if (this.sl.get(user_id).group_id)
            type = 1;
    } catch (e) {}
    return pb2.encode({
        1: [{
            1: [{
                1: this.uin,
                2: user_id,
                3: seq,
                4: 16777216n<<32n|BigInt(random),
                5: timestamp,
                6: random,
            }],
            2: 0,
            3: Buffer.from([0x8,type]),
            4: 1,
        }]
    });
}
function recallGroupMsg(message_id) {
    const {group_id, seq, random} = parseGroupMessageId(message_id);
    return pb2.encode({
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

//on message----------------------------------------------------------------------------------------------------

/**
 * @this {import("../ref").Client}
 */
async function onPrivateMsg(type, head, content, body, update_flag) {
    const user_id = head[1];
    let sub_type, message_id, font = "unknown", time = head[6];
    this.msg_times.push(time);
    const sender = Object.assign({user_id}, this.fl.get(user_id));
    if (type === 141) {
        sub_type = "other";
        if (head[8] && head[8][4]) {
            sub_type = "group";
            const group_id = head[8][4];
            sender.group_id = group_id;
        }
    } else if (type === 166 || type === 208) {
        sub_type = this.fl.has(user_id) ? "friend" : "single";
    } else if (type === 167) {
        sub_type = "single";
    } else {
        return;
    }
    if (!sender.nickname) {
        const stranger = (await this.getStrangerInfo(user_id, update_flag)).data;
        if (stranger) {
            stranger.group_id = sender.group_id;
            Object.assign(sender, stranger);
            this.sl.set(user_id, stranger);
        }
    }
    if (body[1] && body[1][2]) {
        let random = crypto.randomBytes(4).readInt32BE();
        if (body[1][1]) {
            font = String(body[1][1][9].raw);
            random = body[1][1][3];
        }
        message_id = genGroupMessageId(user_id, head[5], random);
        try {
            var {chain, raw_message} = await parseMessage.call(this, body[1]);
        } catch (e) {return}
        if (raw_message) {
            this.logger.info(`recv from: [Private: ${user_id}(${sub_type})] ` + raw_message);
            this.em("message.private." + sub_type, {
                message_id, user_id,
                message: chain,
                raw_message, font, sender, time,
                auto_reply: !!(content&&content[4])
            });
        }
    }
}

/**
 * @this {import("../ref").Client}
 */
async function onGroupMsg(head, body) {

    const user_id = head[1],
        time = head[6];

    this.msg_times.push(time);

    const group = head[9],
        group_id = group[1],
        group_name = String(group[8].raw);

    const message_id = genGroupMessageId(group_id, head[5], body[1][1][3]);

    if (user_id === this.uin)
        this.emit(`interval.${group_id}.${body[1][1][3]}`, message_id);

    this.getGroupInfo(group_id);

    try {
        var {chain, raw_message, extra, anon} = await parseMessage.call(this, body[1], group_id);
    } catch (e) {return}

    let font = String(body[1][1][9].raw),
        card = String(group[4].raw);

    if (extra[2]) {
        card = String(extra[2].raw);
        if (card.startsWith("\n"))
            card = card.split("\n").pop().substr(3);
    }

    let anonymous = null, user = null;
    if (user_id === 80000000) {
        anonymous = {
            id: anon[6],
            name: String(anon[3].raw),
            flag: anon[2] ? anon[2].raw.toString("base64") : ""
        };
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            if (extra[7])
                user.title = String(extra[7].raw);
            if (extra.level)
                user.level = extra[3];
            if (extra[1] && !extra[2]) {
                user.card = card = "";
                user.nickname = String(extra[1].raw);
            } else {
                user.card = card;
            }
            if (time > user.last_sent_time) {
                user.last_sent_time = time;
                this.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) {}
    }

    if (user_id === this.uin && this.ignore_self)
        return;
    if (!raw_message)
        return;

    if (user) {
        var {nickname, sex, age, area, level, role, title} = user;
    } else {
        var nickname = card, sex = "unknown", age = 0, area = "", level = 0, role = "member", title = "";
    }
    const sender = {
        user_id, nickname, card, sex, age, area, level, role, title
    };

    const sub_type = anonymous ? "anonymous" : "normal";
    this.logger.info(`recv from: [Group: ${group_name}(${group_id}), Member: ${card?card:nickname}(${user_id})] ` + raw_message);
    this.em("message.group." + sub_type, {
        message_id, group_id, group_name, user_id, anonymous,
        message: chain,
        raw_message, font, sender, time
    });
}

/**
 * @this {import("../ref").Client}
 */
async function onDiscussMsg(head, body) {

    const user_id = head[1],
        time = head[6];

    this.msg_times.push(time);

    const discuss = head[13],
        discuss_id = discuss[1],
        discuss_name = String(discuss[5].raw);

    if (user_id === this.uin && this.ignore_self)
        return;

    const font = String(body[1][1][9].raw),
        card = nickname = String(discuss[4].raw);

    const sender = {
        user_id, nickname, card
    };

    try {
        var {chain, raw_message} = await parseMessage.call(this, body[1], discuss_id);
    } catch (e) {return}

    if (!raw_message)
        return;

    this.logger.info(`recv from: [Discuss: ${discuss_name}(${discuss_id}), Member: ${card}(${user_id})] ` + raw_message);
    this.em("message.discuss", {
        discuss_id, discuss_name, user_id,
        message: chain,
        raw_message, font, sender, time
    });
}

module.exports = {
    sendMsg, recallMsg, buildSyncCookie,
    onPrivateMsg, onGroupMsg, onDiscussMsg,
    genGroupMessageId
};
