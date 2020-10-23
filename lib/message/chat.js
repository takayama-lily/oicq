"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const buildMessage = require("./builder");
const parseMessage = require("./parser");
const {uploadImages, uploadPtt, uploadMultiMessage} = require("./service");
const common = require("../common");
const pb = require("../pb");
const {handleOnlinePush} = require("../online-push");
const toInt = common.toInt;
const BUF0 = Buffer.alloc(0);
const BUF1 = Buffer.from([1]);
const BUF_PB = Buffer.from([0x78, 0x00, 0xF8, 0x01, 0x00, 0xC8, 0x02, 0x00]);

//send msg----------------------------------------------------------------------------------------------------

async function sendMsg(target, message, escape, type) {
    var [target] = common.uinAutoCheck(target);

    const _sendMsg = async(elems, long = false)=>{
        if (long)
            elems.elems = await toLongMessageElems.call(this, type?common.code2uin(target):target, elems.elems);
        return await (type?sendGroupMsg:sendPrivateMsg).call(this, target, elems, type);
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
                const ptt = await uploadPtt.call(this, target, elem, type);
                elem.fileUuid = elem.groupFileKey = ptt.fileKey;
                rsp = await _sendMsg({ptt: elem});
                break;
            case "flash":
                if (!o.done)
                    await completeImages.call(this, target, [elem[Object.keys(elem)[0]]], type);
                const flash = [
                    {commonElem: {
                        serviceType: 3,
                        pbElem: pb.encode("MsgElemInfoServtype3", elem),
                        businessType: 0,
                    }},
                    {text: {str: "[闪照]请使用新版手机QQ查看闪照。"}}
                ];
                rsp = await _sendMsg({elems: flash});
                break;
            case "json":
            case "xml":
                const rich = [elem];
                if (o.text)
                    rich.push({text: {str: o.text}});
                rsp = await _sendMsg({elems: rich});
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
    rsp = await _sendMsg({elems}, is_long);
    if (!is_long && rsp.result === 0 && rsp.data && rsp.data.message_id === "") {
        this.logger.warn(`判定为风控，这条消息将尝试作为长消息再发送一次。`);
        return await _sendMsg({elems}, true);
    }
    return rsp;
}

async function sendPrivateMsg(user_id, rich) {
    let routing = {c2c: {toUin: user_id}};
    if (this.sl.has(user_id)) {
        try {
            const group_id = this.sl.get(user_id).group_id;
            if ((await this.getGroupMemberInfo(group_id, user_id)).data)
                routing = {grpTmp: {
                    groupUin: common.code2uin(group_id),
                    toUin:    user_id,
                }};
        } catch (e) {}
    } else if (!this.fl.has(user_id)) {
        for (const [k, v] of this.gml) {
            if (v.has(user_id))
                routing = {grpTmp: {
                    groupUin: common.code2uin(k),
                    toUin:    user_id,
                }}
        }
    }
    this.nextSeq();
    const seq = crypto.randomBytes(2).readUInt16BE();
    const random = crypto.randomBytes(2).readUInt16BE();
    const body = pb.encode("SendMessageRequest", {
        routingHead:routing,
        msgBody:    {richText: rich},
        msgSeq:     seq,
        msgRand:    random,
        SyncCookie: pb.encode("SyncCookie", {
            time:   common.timestamp(),
            ran1:   crypto.randomBytes(4).readUInt32BE(),
            ran2:   crypto.randomBytes(4).readUInt32BE(),
            ran3:   crypto.randomBytes(4).readUInt32BE(),
            const1: this.const1,
            const2: this.const2,
            const3: 0x22
        })
    });
    const blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    const resp = pb.decode("PbSendMsgResp", blob);
    if (resp.result === 0) {
        const message_id = common.genSelfMessageId(user_id, seq, random, resp.sendTime);
        this.logger.info(`send to: [Private: ${user_id} / message_id: ${message_id}]`);
        return {result: 0, data: {message_id}};
    }
    this.logger.error(`send failed: [Private: ${user_id}] ` + resp.errmsg);
    return {result: resp.result, emsg: resp.errmsg};
}

async function sendGroupMsg(target, rich, type) {
    this.nextSeq();
    const routing = type === 1 ? {grp: {groupCode: target}} : {dis: {discussUin: target}};
    const random = crypto.randomBytes(4).readInt32BE();
    const body = pb.encode("SendMessageRequest", {
        routingHead:routing,
        msgBody:    {richText: rich},
        msgSeq:     this.seq_id,
        msgRand:    random,
        syncCookie: BUF0,
        msgVia:     1,
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
    const resp = pb.decode("PbSendMsgResp", blob);
    if (resp.result !== 0) {
        this.removeAllListeners(event_id);
        if (resp.result === 120)
            resp.errmsg = "发送失败，在本群被禁言";
        this.logger.error(`send failed: [Group: ${target}] ` + resp.errmsg);
        return {result: resp.result, emsg: resp.errmsg};
    }
    if (type === 2) {
        this.removeAllListeners(event_id);
        return resp;
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

async function toLongMessageElems(uin, elems) {
    const seq = crypto.randomBytes(2).readUInt16BE();
    const msg = [{
        head: {
            fromUin: this.uin,
            msgSeq:  seq,
            msgTime: common.timestamp(),
            msgUid:  0x01000000000000000n | BigInt(seq),
            mutiltransHead: {
                msgId: 1,
            },
            msgType: 82,
            groupInfo: {
                groupCode: common.uin2code(uin),
                groupRank: BUF0,
                groupName: BUF0,
                groupCard: this.nickname,
            },
        },
        body: {
            richText: {elems},
        },
    }];
    let resp;
    try {
        resp = await uploadMultiMessage.call(this, uin, msg, 1);
    } catch (e) {
        throw new Error("fail to upload multi msg");
    }
    const templete = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<msg serviceID="35" templateID="1" action="viewMultiMsg"
        brief="[图文消息]"
        m_resid="${resp.msgResid}"
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
            richMsg: {
                template1: Buffer.concat([BUF1, zlib.deflateSync(templete)]),
                serviceId: 35,
                msgResId:  BUF0,
            }
        },
        {
            generalFlags: {
                longTextFlag:  1,
                longTextResid: resp.msgResid,
                pbReserve:     BUF_PB,
            }
        },
    ];
}

// async function sendForwardMsg(uin, nodes, is_group) {
//     const seq = crypto.randomBytes(2).readUInt16BE(), msg = [];
//     for (let v of nodes) {
//         msg.push({
//             head: {
//                 fromUin: v.uin,
//                 msgSeq:  seq,
//                 msgTime: v.time,
//                 msgUid:  0x01000000000000000n | BigInt(seq),
//                 mutiltransHead: {
//                     msgId: 1,
//                 },
//                 msgType: 82,
//                 groupInfo: {
//                     groupCode: common.uin2code(uin),
//                     groupRank: BUF0,
//                     groupName: BUF0,
//                     groupCard: v.name,
//                 },
//             },
//             body: {
//                 richText: {
//                     elems: [{text: {str: v.content}}]
//                 },
//             },
//         })
//     }
//     let resp;
//     try {
//         resp = await uploadMultiMessage.call(this, uin, msg, 2);
//     } catch (e) {
//         throw new Error();
//     }
//     let preview = "";
//     for (let v of nodes)
//         preview += ` <title color="#000000" size="26" > ${v.name}:${v.content.substr(0, 30)} </title>`
//     const template = `<?xml version="1.0" encoding="utf-8"?>
//     <msg brief="[聊天记录]" m_fileName="${common.uuid().toUpperCase()}" action="viewMultiMsg" tSum="2" flag="3" m_resid="${resp.msgResid}" serviceID="35" m_fileSize="100"  > <item layout="1"> <title color="#000000" size="34" > 群聊的聊天记录 </title>${preview}  <hr></hr> <summary color="#808080" size="26" > 查看转发消息  </summary> </item><source name="聊天记录"></source> </msg>`;
//     const elems = [
//         {
//             richMsg: {
//                 template1: Buffer.concat([BUF1, zlib.deflateSync(template)]),
//                 serviceId: 35,
//             }
//         },
//     ];
//     return await (is_group?sendGroupMsg:sendPrivateMsg).call(this, is_group?common.uin2code(uin):uin, {elems}, is_group);
// }

//recall----------------------------------------------------------------------------------------------------

async function recallMsg(message_id) {
    let body;
    if (message_id[0] === "1")
        body = recallGroupMsg.call(this, message_id);
    else
        body = recallPrivateMsg.call(this, message_id);
    this.nextSeq();
    await this.sendUNI("PbMessageSvc.PbMsgWithDraw", body);
}
function recallPrivateMsg(message_id) {
    const {user_id, seq, random, timestamp} = common.parseSelfMessageId(message_id);
    let type = 0;
    try {
        if (this.sl.get(user_id).group_id)
            type = 1;
    } catch (e) {}
    return pb.encode("MsgWithDrawReq", {
        c2cWithDraw: [{
            subCmd:     1,
            msgInfo:    [{
                fromUin:    this.uin,
                toUin:      user_id,
                msgTime:    timestamp,
                msgUid:     {low:random,high:16777216,unsigned:false},
                msgSeq:     seq,
                msgRandom:  random,
            }],
            reserved: Buffer.from([0x8,type]),
            longMessageFlag: 0,
        }]
    });
}
function recallGroupMsg(message_id) {
    const {group_id, seq, random} = common.parseGroupMessageId(message_id);
    return pb.encode("MsgWithDrawReq", {
        groupWithDraw: [{
            subCmd:     1,
            groupCode:  group_id,
            msgList:    [{
                msgSeq:    seq,
                msgRandom: random,
                msgType:   0,
            }],
            userDef:    Buffer.from([8,0]),
        }]
    });
}

//on message----------------------------------------------------------------------------------------------------

async function onPrivateMsg(type, user_id, head, body, update_flag) {
    let sub_type, message_id, font = "unknown";
    const sender = Object.assign({user_id}, this.fl.get(user_id));
    if (type === 141) {
        sub_type = "other";
        if (head.c2cTmpMsgHead && head.c2cTmpMsgHead.groupCode) {
            sub_type = "group";
            const group_id = toInt(head.c2cTmpMsgHead.groupCode);
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
    if (body.richText && body.richText.elems) {
        let random = crypto.randomBytes(4).readInt32BE();
        if (body.richText.attr) {
            font = body.richText.attr.fontName;
            random = body.richText.attr.random;
        }
        message_id = common.genGroupMessageId(user_id, head.msgSeq, random);
        try {
            var {chain, raw_message} = await parseMessage.call(this, body.richText);
        } catch (e) {return}
        if (raw_message) {
            this.logger.info(`recv from: [Private: ${user_id}(${sub_type})] ` + raw_message);
            this.em("message.private." + sub_type, {
                message_id, user_id, message: chain, raw_message, font, sender, time: toInt(head.msgTime)
            });
        }
    }
}

async function onGroupMsg(blob) {
    if (!this.sync_finished) return;
    const o = pb.decode("PushMessagePacket", blob);
    // common.log(o);
    const head = o.message.head, body = o.message.body, user_id = toInt(head.fromUin), time = toInt(head.msgTime);
    const group = head.groupInfo, group_id = toInt(group.groupCode), group_name = group.groupName.toString();
    const message_id = common.genGroupMessageId(group_id, head.msgSeq, body.richText.attr.random);
    if (user_id === this.uin)
        this.emit(`interval.${group_id}.${body.richText.attr.random}`, message_id);

    this.getGroupInfo(group_id);

    try {
        var {chain, raw_message, extra} = await parseMessage.call(this, body.richText, group_id);
    } catch (e) {return}

    let font = body.richText.attr.fontName, card = group.groupCard;
    if (extra.groupCard) {
        card = String(extra.groupCard);
        if (card.startsWith("\n"))
            card = card.split("\n").pop().substr(3);
    }

    let anonymous = null, user = null;
    if (user_id === 80000000) {
        anonymous = {
            id: extra.bubbleId,
            name: String(extra.anonNick),
            flag: extra.anonId ? extra.anonId.toString("base64") : ""
        };
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            if (extra.senderTitle)
                user.title = String(extra.senderTitle);
            if (extra.level)
                user.level = String(extra.level);
            if (extra.nick && !extra.groupCard) {
                user.card = "";
                user.nickname = String(extra.nick);
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
    this.logger.info(`recv from: [Group: ${group_name}(${group_id}), Member: ${card}(${user_id})] ` + raw_message);
    this.em("message.group." + sub_type, {
        message_id, group_id, group_name, user_id, anonymous, message: chain, raw_message, font, sender, time
    });
}

async function onDiscussMsg(blob, seq) {
    const o = pb.decode("PushMessagePacket", blob);
    handleOnlinePush.call(this, o.svrip, seq);
    if (!this.sync_finished) return;
    // common.log(o);
    const head = o.message.head, body = o.message.body, user_id = toInt(head.fromUin), time = toInt(head.msgTime);
    const discuss = head.discussInfo, discuss_id = toInt(discuss.discussUin), discuss_name = discuss.discussName.toString();

    if (user_id === this.uin && this.ignore_self)
        return;

    const font = body.richText.attr.fontName, card = discuss.discussRemark, nickname = card;
    const sender = {
        user_id, nickname, card
    };

    try {
        var {chain, raw_message} = await parseMessage.call(this, body.richText, discuss_id);
    } catch (e) {return}

    if (!raw_message)
        return;

    this.logger.info(`recv from: [Discuss: ${discuss_name}(${discuss_id}), Member: ${card}(${user_id})] ` + raw_message);
    this.em("message.discuss", {
        discuss_id, discuss_name, user_id, message: chain, raw_message, font, sender, time
    });
}

module.exports = {
    sendMsg, recallMsg,
    onPrivateMsg, onGroupMsg, onDiscussMsg
};
