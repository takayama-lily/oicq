"use strict";
const zlib = require("zlib");
const crypto = require("crypto");
const {buildMessage, parseMessage, buildRawMessage} = require("./message");
const {uploadImages, uploadPtt, uploadMultiMessage, downloadRichMsg} = require("./service");
const common = require("./common");
const pb = require("./pb");
const {handleOnlinePush} = require("./online-push");
const toInt = common.toInt;
const BUF0 = Buffer.alloc(0);
const BUF1 = Buffer.from([1]);
const BUF_PB = Buffer.from([0x78, 0x00, 0xF8, 0x01, 0x00, 0xC8, 0x02, 0x00]);

//send msg----------------------------------------------------------------------------------------------------

async function sendMsg(target, message, escape, is_group, as_long = false) {
    var [target] = common.uinAutoCheck(target);
    let elems = await buildMessage(message, escape, is_group);
    if (!Array.isArray(elems)) {
        if (elems.type === "ptt")
            return await buildPttMessageRequestPacket.call(this, target, elems.elem, is_group);
        if (elems.type === "flash")
            return await buildFlashMessageRequestPacket.call(this, target, elems.elem, is_group);
        if (elems.type === "forward")
            return await buildForwardMessageRequestPacket.call(this, is_group?common.code2uin(target):target, elems.elem, is_group);
    }
    const images = elems.shift(), is_long = elems.pop();
    await commonImageMessage.call(this, target, images, is_group, elems);
    if (!elems.length)
        throw new Error("empty message");
    if (is_long || as_long)
        elems = await toLongMessageElems.call(this, is_group?common.code2uin(target):target, elems);
    const rsp = await (is_group?commonGroupMessage:commonPrivateMessage).call(this, target, {elems}, is_group);
    if (!as_long && rsp.result === 0 && rsp.data && rsp.data.message_id === "") {
        this.logger.warn(`你被风控了，这条消息将尝试作为长消息再发送一次。`);
        return await sendMsg(target, message, escape, is_group, true);
    }
    return rsp;
}
async function commonPrivateMessage(user_id, rich) {
    let routing = {c2c: {toUin: user_id}};
    if (this.sl.has(user_id)) {
        try {
            let group_id = this.sl.get(user_id).group_id;
            group_id = this.gml.get(group_id).get(user_id).group_id;
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
            ran1:   common.rand(9),
            ran2:   common.rand(9),
            const1: this.const1,
            const2: this.const2,
            const3: 0x1D
        })
    });
    const blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    const resp = pb.decode("PbSendMsgResp", blob);
    if (resp.result === 0) {
        const message_id = common.genSelfMessageId(user_id, seq, random, resp.sendTime);
        this.logger.info(`send to: [Private: ${user_id} / message_id: ${message_id}]`);
        return {result: 0, data: {message_id}};
    }
    this.logger.error(`send failed: [Private: ${user_id}] ` + resp.errmsg)
    return {result: resp.result};
}
async function commonGroupMessage(target, rich, type) {
    this.nextSeq();
    const routing = type === 1 ? {grp: {groupCode: target}} : {dis: {discussUin: target}};
    const rand = common.rand();
    const body = pb.encode("SendMessageRequest", {
        routingHead:routing,
        msgBody:    {richText: rich},
        msgSeq:     this.seq_id,
        msgRand:    rand,
        syncCookie: BUF0,
        msgVia:     1,
    });
    const event_id = `interval.${target}.${rand}`;
    let message_id = "";
    this.once(event_id, (id)=>message_id=id);
    const blob = await this.sendUNI("MessageSvc.PbSendMsg", body);
    const resp = pb.decode("PbSendMsgResp", blob);
    if (resp.result !== 0) {
        this.removeAllListeners(event_id);
        this.logger.error(`send failed: [Group: ${target}] ` + resp.errmsg);
        return {result: resp.result};
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
async function commonImageMessage(target, images, is_group, elems) {
    let n = 0;
    while (images.length > n) {
        const imgs = images.slice(n, n + 20);
        n = n + 20;
        try {
            const resp = await (is_group?imageStore:offPicUp).call(this, target, imgs);
            for (let i = 0; i < resp.msgTryUpImgRsp.length; ++i) {
                var v = resp.msgTryUpImgRsp[i];
                imgs[i].key = v.upUkey;
                imgs[i].exists = v.boolFileExit;
                imgs[i].fid = is_group ? v.fid.low : v.upResid;
                if (elems) {
                    if (is_group)
                        elems[imgs[i].index].customFace.fileId = imgs[i].fid;
                    else {
                        elems[imgs[i].index].notOnlineImage.resId = imgs[i].fid;
                        elems[imgs[i].index].notOnlineImage.downloadPath = imgs[i].fid;
                    }
                }
            }
            uploadImages(this.uin, v.uint32UpIp, v.uint32UpPort, imgs);
        } catch (e) {}
    }
}
async function toLongMessageElems(uin, elems) {
    const seq = common.rand();
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
    const compressed = zlib.gzipSync(pb.encode("PbMultiMsgTransmit", {
        msg, pbItemList: [{
            fileName: "MultiMsg",
            buffer:   pb.encode("PbMultiMsgNew", {msg}),
        }]
    }));
    let resp;
    try {
        resp = await applyUp.call(this, uin, compressed, 1);
        resp = resp.multimsgApplyupRsp[0];
        if (resp.result > 0)
            throw new Error();
        const body = pb.encode("LongReqBody", {
            subcmd:         1,
            termType:       5,
            platformType:   9,
            msgUpReq:       [{
                msgType:    3,
                dstUin:     uin,
                msgContent: compressed,
                storeType:  2,
                msgUkey:    resp.msgUkey,
            }],
        });
        uploadMultiMessage(this.uin, resp.uint32UpIp, resp.uint32UpPort, {
            buf: body,
            md5: common.md5(body),
            key: resp.msgSig
        });
    } catch (e) {
        throw new Error();
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
async function buildPttMessageRequestPacket(target, ptt, is_group) {
    const resp = await pttUp.call(this, target, ptt);
    const v = resp.msgTryUpPttRsp[0];
    if (!v.boolFileExit)
        await uploadPtt(ptt, v);
    ptt = {
        fileType: 4,
        fileMd5: ptt.md5,
        fileName: ptt.md5.toString("hex") + ".amr",
        fileSize: ptt.length,
        boolValid: true,
        groupFileKey: v.fileKey,
        pbReserve: Buffer.from([8, 0, 40, 0, 56, 0]),
    };
    return await commonGroupMessage.call(this, target, {ptt}, is_group);
}
async function buildFlashMessageRequestPacket(target, flash, is_group) {
    await commonImageMessage.call(this, target, [flash], is_group);
    const elem = is_group ? {flashTroopPic: {
        size:       flash.size,
        filePath:   flash.md5.toString("hex"),
        md5:        flash.md5,
        fileId:     flash.fid,
    }} : {flashC2cPic: {
        fileLen:    flash.size,
        filePath:   flash.fid,
        resId:      flash.fid,
        picMd5:     flash.md5.toString("hex"),
        oldPicMd5:  false
    }};
    const elems = [
        {commonElem: {
            serviceType: 3,
            pbElem: pb.encode("MsgElemInfoServtype3", elem),
            businessType: 0,
        }},
        {text: {str: "[闪照]请使用新版手机QQ查看闪照。"}}
    ];
    return await (is_group?commonGroupMessage:commonPrivateMessage).call(this, target, {elems}, is_group);
}
async function buildForwardMessageRequestPacket(uin, nodes, is_group) {
    const seq = common.rand(), msg = [];
    for (let v of nodes) {
        msg.push({
            head: {
                fromUin: v.uin,
                msgSeq:  seq,
                msgTime: v.time,
                msgUid:  0x01000000000000000n | BigInt(seq),
                mutiltransHead: {
                    msgId: 1,
                },
                msgType: 82,
                groupInfo: {
                    groupCode: common.uin2code(uin),
                    groupRank: BUF0,
                    groupName: BUF0,
                    groupCard: v.name,
                },
            },
            body: {
                richText: {
                    elems: [{text: {str: v.content}}]
                },
            },
        })
    }
    const compressed = zlib.gzipSync(pb.encode("PbMultiMsgTransmit", {
        msg, pbItemList: [{
            fileName: "MultiMsg",
            buffer:   pb.encode("PbMultiMsgNew", {msg}),
        }]
    }));
    let resp;
    try {
        resp = await applyUp(this, uin, compressed, 2);
        resp = resp.multimsgApplyupRsp[0];
        if (resp.result > 0)
            throw new Error();
        const body = pb.encode("LongReqBody", {
            subcmd:         1,
            termType:       5,
            platformType:   9,
            msgUpReq:       [{
                msgType:    3,
                dstUin:     uin,
                msgContent: compressed,
                storeType:  2,
                msgUkey:    resp.msgUkey,
            }],
        });
        uploadMultiMessage(this.uin, resp.uint32UpIp, resp.uint32UpPort, {
            buf: body,
            md5: common.md5(body),
            key: resp.msgSig
        });
    } catch (e) {
        throw new Error();
    }
    let preview = "";
    for (let v of nodes)
        preview += ` <title color="#000000" size="26" > ${v.name}:${v.content.substr(0, 30)} </title>`
    const template = `<?xml version="1.0" encoding="utf-8"?>
    <msg brief="[聊天记录]" m_fileName="${common.uuid().toUpperCase()}" action="viewMultiMsg" tSum="2" flag="3" m_resid="${resp.msgResid}" serviceID="35" m_fileSize="${compressed.length}"  > <item layout="1"> <title color="#000000" size="34" > 群聊的聊天记录 </title>${preview}  <hr></hr> <summary color="#808080" size="26" > 查看转发消息  </summary> </item><source name="聊天记录"></source> </msg>`;
    const elems = [
        {
            richMsg: {
                template1: Buffer.concat([BUF1, zlib.deflateSync(template)]),
                serviceId: 35,
            }
        },
    ];
    return await (is_group?commonGroupMessage:commonPrivateMessage).call(this, is_group?common.uin2code(uin):uin, {elems}, is_group);
}

//recall----------------------------------------------------------------------------------------------------

async function recallMsg(message_id) {
    let body;
    if (message_id.length < 24)
        body = recallGroupMsg.call(this, message_id);
    else
        body = recallPrivateMsg.call(this, message_id);
    this.nextSeq();
    await this.sendUNI("PbMessageSvc.PbMsgWithDraw", body);
}
function recallPrivateMsg(message_id) {
    const {user_id, seq, random, timestamp} = common.parseSelfMessageId(message_id);
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
            reserved: Buffer.from([0x8,0x1]),
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

//service----------------------------------------------------------------------------------------------------

/**
 * @param {JSON[]} images
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
            buildVer:       "8.2.7.4410",
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
            buildVer:       "8.2.7.4410",
            fileIndex:      BUF0,
            srvUpload:      1,
            transferUrl:    BUF0,
        });
    }
    const body = pb.encode("OffPicUpReqBody", {
        subcmd:  1,
        msgTryUpImgReq: req
    });
    const blob = await this.sendUNI("LongConn.OffPicUp", body);
    return pb.decode("OffPicUpRspBody", blob);
}

async function pttUp(group_id, ptt) {
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
        buildVer:       "6.5.5.663",
        voiceLength:    1,
        codec:          ptt.ext===".amr"?0:1,
        voiceType:      1,
        boolNewUpChan:  true,
    });
    const body = pb.encode("D388ReqBody", {
        netType: 3,
        subcmd:  3,
        msgTryUpPttReq: req,
        extension: BUF0,
    });
    const blob = await this.sendUNI("PttStore.GroupPttUp", body);
    return pb.decode("D388RespBody", blob);
}

async function applyUp(uin, buf, bu) {
    this.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         1,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         bu,
        reqChannelType: 0,
        multimsgApplyupReq: [{
            applyId:    0,
            dstUin:     uin,
            msgSize:    buf.length,
            msgMd5:     common.md5(buf),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyUp", body);
    return pb.decode("MultiRspBody", blob);
}

async function applyDown(resid, bu) {
    this.nextSeq();
    const body = pb.encode("MultiReqBody", {
        subcmd:         2,
        termType:       5,
        platformType:   9,
        netType:        3,
        buildVer:       "8.2.0.1296",
        buType:         bu,
        reqChannelType: 2,
        multimsgApplydownReq: [{
            msgResid:   Buffer.from(resid),
            msgType:    3,
        }],
    });
    const blob = await this.sendUNI("MultiMsg.ApplyDown", body);
    return pb.decode("MultiRspBody", blob);
}

async function getGroupFileUrl(group_id, bus_id, file_id) {
    this.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     1750,
        serviceType: 2,
        bodybuffer:  pb.encode("D6D6ReqBody", {
            downloadFileReq: {
                groupCode: group_id,
                appId:     3,
                busId:     bus_id,
                fileId:    file_id,
            }
        }),
    });
    const blob = await this.sendUNI("OidbSvc.0x6d6_2", body);
    return pb.decode("D6D6RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
}

//on message----------------------------------------------------------------------------------------------------

async function onPrivateMsg(type, user_id, head, body, update_flag) {
    let sub_type, message_id, font;
    const sender = Object.assign({user_id}, this.fl.get(user_id));
    if (type === 141) {
        sub_type = "other";
        if (head.c2cTmpMsgHead && head.c2cTmpMsgHead.groupCode) {
            sub_type = "group";
            const group_id = toInt(head.c2cTmpMsgHead.groupCode);
            sender.group_id = group_id;
        }
    } else if (type === 166) { //208语音
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
    if (body.richText && body.richText.elems && body.richText.attr) {
        message_id = common.genGroupMessageId(user_id, head.msgSeq, body.richText.attr.random);
        font = body.richText.attr.fontName;
        try {
            var res = await getMsgFromElems.call(this, body.richText);
        } catch (e) {return}
        const {chain, raw_message} = res;
        if (raw_message) {
            this.logger.info(`recv from: [Private: ${user_id}(${sub_type})] ` + raw_message);
            common.emit(this, "message.private." + sub_type, {
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

    const font = body.richText.attr.fontName, card = group.groupCard;
    let anonymous = null, user = null;
    if (user_id === 80000000) {
        anonymous = {
            id:0, name: card, flag: ""
        };
    } else {
        try {
            user = (await this.getGroupMemberInfo(group_id, user_id)).data;
            user.card = card;
            if (time > user.last_sent_time) {
                user.last_sent_time = time;
                this.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) {}
    }

    if (user_id === this.uin && this.ignore_self)
        return;

    if (user) {
        var {nickname, sex, age, area, level, role, title} = user;
    } else {
        var nickname = card, sex = "unknown", age = 0, area = "", level = 0, role = "member", title = "";
    }
    const sender = {
        user_id, nickname, card, sex, age, area, level, role, title
    };

    let res;
    try {
        res = await getMsgFromElems.call(this, body.richText);
    } catch (e) {return}
    let {chain, raw_message} = res;

    try {
        if (chain[0].type === "notice") {
            const v = chain[0];
            raw_message = "";
            common.emit(this, "notice.group.notice", {
                group_id, group_name, user_id, sender, time, title: "群公告", content: chain[0].data.text
            });
        }
        if (chain[0].type === "file") {
            const v = chain[0];
            let resp = await getGroupFileUrl.call(this, group_id, v.data.busId, v.data.filePath.toString());
            resp = resp.downloadFileRsp;
            v.data = {
                name:   v.data.fileName,
                url:    `http://${resp.downloadIp}/ftn_handler/${resp.downloadUrl.toString("hex")}/?fname=${v.data.fileName}`,
                size:   toInt(v.data.fileSize),
                md5:    resp.md5.toString("hex"),
                duration: v.data.int64DeadTime.low,
            };
            raw_message = buildRawMessage(v);
            common.emit(this, "notice.group.file", {
                group_id, group_name, user_id, sender, time, file: v.data
            });
        }
    } catch (e) {return}

    if (!raw_message)
        return;

    const sub_type = anonymous ? "anonymous" : "normal";
    this.logger.info(`recv from: [Group: ${group_name}(${group_id}), Member: ${card}(${user_id})] ` + raw_message);
    common.emit(this, "message.group." + sub_type, {
        message_id, group_id, group_name, user_id, anonymous, message: chain, raw_message, font, sender, time
    });
}

async function onDiscussMsg(blob, seq) {
    const o = pb.decode("PushMessagePacket", blob);
    this.write(buildOnlinePushResponsePacket(o.svrip, seq, [], this));
    handleOnlinePush.call(this, o.svrip, seq, []);
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

    let res;
    try {
        res = await getMsgFromElems.call(this, body.richText);
    } catch (e) {return}
    let {chain, raw_message} = res;

    if (!raw_message)
        return;

    this.logger.info(`recv from: [Discuss: ${discuss_name}(${discuss_id}), Member: ${card}(${user_id})] ` + raw_message);
    common.emit(this, "message.discuss", {
        discuss_id, discuss_name, user_id, message: chain, raw_message, font, sender, time
    });
}

async function getMsgFromElems(rich) {
    let res = parseMessage(rich);
    if (typeof res === "string") {
        const resp = await applyDown.call(this, res, 1);
        res = await downloadRichMsg(resp);
        res = parseMessage(res.msg[0].body.richText);
    }
    return res;
}

module.exports = {
    sendMsg, recallMsg,
    onPrivateMsg, onGroupMsg, onDiscussMsg
};
