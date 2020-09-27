//get msg----------------------------------------------------------------------------------------------------

/**
 * @param {0|1|2} sync_flag 0:start 1:continue 2:stop
 */
function buildGetMessageRequestPacket(sync_flag, c) {
    c.nextSeq();
    if (!c.sync_cookie) {
        const time = common.timestamp();
        c.sync_cookie = pb.encode("SyncCookie", {
            time1:  time,
            time:   time,
            ran1:   crypto.randomBytes(4).readUInt32BE(),
            ran2:   crypto.randomBytes(4).readUInt32BE(),
            ran3:   crypto.randomBytes(4).readUInt32BE(),
            const1: c.const1,
            const2: c.const2,
            const3: 0x22,
            lastSyncTime: time,
            const4: 0,
        });
    }
    let body = pb.encode("GetMessageRequest", {
        syncFlag:           sync_flag,
        syncCookie:         c.sync_cookie,
        rambleFlag:         0,
        latestRambleNumber: 20,
        otherRambleNumber:  3,
        onlineSyncFlag:     1,
        contextFlag:        1,
        msgReqType:         1,
        // pubaccountCookie:   BUF0,
        // msgCtrlBuf:         BUF0,
        serverBuf:          BUF0,
    })
    return commonUNI(c, CMD.GET_MSG, body);
}
function buildDeleteMessageRequestPacket(items ,c) {
    c.nextSeq();
    const body = pb.encode("DeleteMessageRequest", {items});
    return commonUNI(c, CMD.DELETE_MSG, body);
}

//send msg----------------------------------------------------------------------------------------------------

async function commonMessage(target, message, escape, is_group, as_long, c) {
    let elems = await buildMessage(message, escape, is_group);
    if (!Array.isArray(elems)) {
        if (elems.type === "ptt")
            return await buildPttMessageRequestPacket(target, elems.elem, is_group, c);
        if (elems.type === "flash")
            return await buildFlashMessageRequestPacket(target, elems.elem, is_group, c);
        if (elems.type === "forward")
            return await buildForwardMessageRequestPacket(is_group?common.code2uin(target):target, elems.elem, is_group, c);
    }
    const images = elems.shift(), is_long = elems.pop();
    await commonImageMessage(target, images, is_group, elems, c);
    if (!elems.length)
        throw new Error("消息内容为空");
    if (is_long || as_long)
        elems = await toLongMessageElems(is_group?common.code2uin(target):target, elems, c);
    return (is_group?commonGroupMessage:commonPrivateMessage).call(null, target, {elems}, is_group, c);
}
function commonPrivateMessage(user_id, rich, is_group, c) {
    let routing = {c2c: {toUin: user_id}};
    if (c.sl.has(user_id)) {
        try {
            let group_id = c.sl.get(user_id).group_id;
            group_id = c.gml.get(group_id).get(user_id).group_id;
            routing = {grpTmp: {
                groupUin: common.code2uin(group_id),
                toUin:    user_id,
            }};
        } catch (e) {}
    } else if (!c.fl.has(user_id)) {
        for (const [k, v] of c.gml) {
            if (v.has(user_id))
                routing = {grpTmp: {
                    groupUin: common.code2uin(k),
                    toUin:    user_id,
                }}
        }
    }
    c.nextSeq();
    const seq = crypto.randomBytes(2).readUInt16BE();
    const random = crypto.randomBytes(2).readUInt16BE();
    c.curr_msg_id = common.genSelfMessageId(user_id, seq, random);
    const body = pb.encode("SendMessageRequest", {
        routingHead:routing,
        msgBody:    {richText: rich},
        msgSeq:     seq,
        msgRand:    random,
        SyncCookie: pb.encode("SyncCookie", {
            time:   common.timestamp(),
            ran1:   common.rand(9),
            ran2:   common.rand(9),
            const1: c.const1,
            const2: c.const2,
            const3: 0x1D
        })
    });
    return commonUNI(c, CMD.SEND_MSG, body);
}
function commonGroupMessage(target, rich, is_group, c) {
    c.nextSeq();
    const routing = is_group === 1 ? {grp: {groupCode: target}} : {dis: {discussUin: target}};
    c.curr_msg_rand = common.rand();
    const body = pb.encode("SendMessageRequest", {
        routingHead:routing,
        msgBody:    {richText: rich},
        msgSeq:     c.seq_id,
        msgRand:    c.curr_msg_rand,
        syncCookie: BUF0,
        msgVia:     1,
    });
    return commonUNI(c, CMD.SEND_MSG, body);
}
async function commonImageMessage(target, images, is_group, elems, c) {
    let n = 0;
    while (images.length > n) {
        const imgs = images.slice(n, n + 20);
        n = n + 20;
        try {
            const resp = await c.send((is_group?buildImageStoreRequestPacket:buildOffPicUpRequestPacket).call(null, target, imgs, c));
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
            uploadImages(c.uin, v.uint32UpIp, v.uint32UpPort, imgs);
        } catch (e) {}
    }
}
async function toLongMessageElems(uin, elems, c) {
    const seq = common.rand();
    const msg = [{
        head: {
            fromUin: c.uin,
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
                groupCard: c.nickname,
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
        resp = await c.send(buildMultiApplyUpRequestPacket(uin, compressed, 1, c));
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
        uploadMultiMessage(c.uin, resp.uint32UpIp, resp.uint32UpPort, {
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
async function buildPttMessageRequestPacket(target, ptt, is_group, c) {
    const resp = await c.send(buildPttUpRequestPacket(target, ptt, c));
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
    return commonGroupMessage(target, {ptt}, is_group, c);
}
async function buildFlashMessageRequestPacket(target, flash, is_group, c) {
    await commonImageMessage(target, [flash], is_group, null, c);
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
    return (is_group?commonGroupMessage:commonPrivateMessage).call(null, target, {elems}, is_group, c);
}
async function buildForwardMessageRequestPacket(uin, nodes, is_group, c) {
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
        resp = await c.send(buildMultiApplyUpRequestPacket(uin, compressed, 2, c));
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
        uploadMultiMessage(c.uin, resp.uint32UpIp, resp.uint32UpPort, {
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
    return (is_group?commonGroupMessage:commonPrivateMessage).call(null, is_group?common.uin2code(uin):uin, {elems}, is_group, c);
}

//recall----------------------------------------------------------------------------------------------------

function buildFriendRecallRequestPacket(message_id, c) {
    c.nextSeq();
    const {user_id, seq, random, timestamp} = common.parseSelfMessageId(message_id);
    const body = pb.encode("MsgWithDrawReq", {
        c2cWithDraw: [{
            subCmd:     1,
            msgInfo:    [{
                fromUin:    c.uin,
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
    return commonUNI(c, CMD.RECALL, body);
}
function buildGroupRecallRequestPacket(message_id, c) {
    c.nextSeq();
    const {group_id, seq, random} = common.parseGroupMessageId(message_id);
    const body = pb.encode("MsgWithDrawReq", {
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
    return commonUNI(c, CMD.RECALL, body);
}

//service----------------------------------------------------------------------------------------------------

/**
 * @param {Object[]} images
 *  @field {Buffer} md5
 *  @field {Number} size
 */
function buildImageStoreRequestPacket(group_id, images, c) {
    c.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            groupCode:      group_id,
            srcUin:         c.uin,
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
    return commonUNI(c, CMD.IMG_STORE, body);
}
function buildOffPicUpRequestPacket(user_id, images, c) {
    c.nextSeq();
    const req = [];
    for (const v of images) {
        req.push({
            srcUin:         c.uin,
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
    return commonUNI(c, CMD.OFF_PIC_UP, body);
}
function buildPttUpRequestPacket(group_id, ptt, c) {
    c.nextSeq();
    const req = [];
    req.push({
        groupCode:      group_id,
        srcUin:         c.uin,
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
    return commonUNI(c, CMD.PTT_UP, body);
}
function buildMultiApplyUpRequestPacket(uin, buf, bu, c) {
    c.nextSeq();
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
    return commonUNI(c, CMD.MULTI_UP, body);
}
function buildMultiApplyDownRequestPacket(resid, bu, c) {
    c.nextSeq();
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
    return commonUNI(c, CMD.MULTI_DOWN, body);
}

function buildGroupFileUrlRequestPacket(group_id, bus_id, file_id, c) {
    c.nextSeq();
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
    return commonUNI(c, CMD.GROUP_FILE, body);
}

//message----------------------------------------------------------------------------------------------------

/**
 * @returns {void}
 */
async function decodeMessageSvcResponse(blob, c) {
    const o = pb.decode("GetMessageResponse", blob);
    if (o.syncCookie)
        c.sync_cookie = o.syncCookie;
    if (o.result > 0 || !o.uinPairMsgs)
        return;
    // common.log(o);
    const rubbish = [];
    for (let v of o.uinPairMsgs) {
        if (!v.messages) continue;
        for (let msg of v.messages) {
            const head = msg.head, body = msg.body;
            const type = head.msgType, time = toInt(head.msgTime);
            head.msgType = 187;
            rubbish.push(head);
            if (!c.sync_finished)
                continue;
            let user_id = toInt(head.fromUin);
            if (user_id === c.uin)
                continue;
            // if (v.lastReadTime === -1 || v.lastReadTime > head.msgTime)
            //     continue;
            let update_flag = false;
            if (!c.seq_cache.has(user_id)) {
                c.seq_cache.set(user_id, head.msgSeq);
            } else {
                const seq = c.seq_cache.get(user_id);
                if (seq - head.msgSeq >= 0 && seq - head.msgSeq < 1000)
                    continue;
                else {
                    update_flag = Math.abs(head.msgSeq - seq) > 1 || head.msgSeq % 10 === 0;
                    c.seq_cache.set(user_id, head.msgSeq);
                }
            }
            if (type === 33) {
                (async()=>{
                    const group_id = common.uin2code(user_id);
                    user_id = toInt(head.authUin);
                    try {
                        const ginfo = (await c.getGroupInfo(group_id)).data;
                        if (user_id === c.uin) {
                            c.logger.info(`更新了群列表，新增了群：${group_id}`);
                            c.getGroupMemberList(group_id);
                        } else {
                            ginfo.member_count++;
                            ginfo.last_join_time = common.timestamp();
                            await c.getGroupMemberInfo(group_id, user_id);
                        }
                    } catch (e) {}
                    event.emit(c, "notice.group.increase", {
                        group_id, user_id,
                        nickname: head.authNick
                    });
                })();
                continue;
            }
            let sub_type, message_id, font;
            const sender = Object.assign({user_id}, c.fl.get(user_id));
            if (type === 141) {
                sub_type = "other";
                if (head.c2cTmpMsgHead && head.c2cTmpMsgHead.groupCode) {
                    sub_type = "group";
                    const group_id = toInt(head.c2cTmpMsgHead.groupCode);
                    sender.group_id = group_id;
                }
            } else if (type === 166) { //208语音
                sub_type = c.fl.has(user_id) ? "friend" : "single";
            } else if (type === 167) {
                sub_type = "single";
            } else {
                continue;
            }
            if (!sender.nickname) {
                const stranger = (await c.getStrangerInfo(user_id, update_flag)).data;
                if (stranger) {
                    stranger.group_id = sender.group_id;
                    Object.assign(sender, stranger);
                    c.sl.set(user_id, stranger);
                }
            }
            if (body.richText && body.richText.elems && body.richText.attr) {
                message_id = common.genGroupMessageId(user_id, head.msgSeq, body.richText.attr.random);
                font = body.richText.attr.fontName;
                let res;
                (async()=>{
                    try {
                        res = await getMsgFromElems(body.richText, c);
                    } catch (e) {return}
                    const {chain, raw_message} = res;
                    if (raw_message) {
                        c.logger.info(`recv from: [Private: ${user_id}(${sub_type})] ` + raw_message);
                        event.emit(c, "message.private." + sub_type, {
                            message_id, user_id, message: chain, raw_message, font, sender, time
                        });
                    }
                })();
            }
        }
    }

    if (rubbish.length)
        c.write(outgoing.buildDeleteMessageRequestPacket(rubbish, c));
    if (o.syncFlag !== 2)
        c.write(outgoing.buildGetMessageRequestPacket(o.syncFlag, c));
}

async function decodeGroupMessageEvent(blob, c) {
    if (!c.sync_finished) return;
    const o = pb.decode("PushMessagePacket", blob);
    // common.log(o);
    const head = o.message.head, body = o.message.body, user_id = toInt(head.fromUin), time = toInt(head.msgTime);
    const group = head.groupInfo, group_id = toInt(group.groupCode), group_name = group.groupName.toString();
    const message_id = common.genGroupMessageId(group_id, head.msgSeq, body.richText.attr.random);
    if (user_id === c.uin)
        c.emit(`interval.${group_id}.${body.richText.attr.random}`, message_id);

    c.getGroupInfo(group_id);

    const font = body.richText.attr.fontName, card = group.groupCard;
    let anonymous = null, user = null;
    if (user_id === 80000000) {
        anonymous = {
            id:0, name: card, flag: ""
        };
    } else {
        try {
            user = (await c.getGroupMemberInfo(group_id, user_id)).data;
            user.card = card;
            if (time > user.last_sent_time) {
                user.last_sent_time = time;
                c.gl.get(group_id).last_sent_time = time;
            }
        } catch (e) {}
    }

    if (user_id === c.uin && c.ignore_self)
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
        res = await getMsgFromElems(body.richText, c);
    } catch (e) {return}
    let {chain, raw_message} = res;

    try {
        if (chain[0].type === "notice") {
            const v = chain[0];
            raw_message = "";
            event.emit(c, "notice.group.notice", {
                group_id, group_name, user_id, sender, time, title: "群公告", content: chain[0].data.text
            });
        }
        if (chain[0].type === "file") {
            const v = chain[0];
            let resp = await c.send(outgoing.buildGroupFileUrlRequestPacket(group_id, v.data.busId, v.data.filePath.toString(), c));
            resp = resp.downloadFileRsp;
            v.data = {
                name:   v.data.fileName,
                url:    `http://${resp.downloadIp}/ftn_handler/${resp.downloadUrl.toString("hex")}/?fname=${v.data.fileName}`,
                size:   toInt(v.data.fileSize),
                md5:    resp.md5.toString("hex"),
                duration: v.data.int64DeadTime.low,
            };
            raw_message = buildRawMessage(v);
            event.emit(c, "notice.group.file", {
                group_id, group_name, user_id, sender, time, file: v.data
            });
        }
    } catch (e) {return}

    if (!raw_message)
        return;

    const sub_type = anonymous ? "anonymous" : "normal";
    c.logger.info(`recv from: [Group: ${group_name}(${group_id}), Member: ${card}(${user_id})] ` + raw_message);
    event.emit(c, "message.group." + sub_type, {
        message_id, group_id, group_name, user_id, anonymous, message: chain, raw_message, font, sender, time
    });
}

async function decodeDiscussMessageEvent(blob, c, seq) {
    const o = pb.decode("PushMessagePacket", blob);
    c.write(outgoing.buildOnlinePushResponsePacket(o.svrip, seq, [], c));
    if (!c.sync_finished) return;
    // common.log(o);
    const head = o.message.head, body = o.message.body, user_id = toInt(head.fromUin), time = toInt(head.msgTime);
    const discuss = head.discussInfo, discuss_id = toInt(discuss.discussUin), discuss_name = discuss.discussName.toString();

    if (user_id === c.uin && c.ignore_self)
        return;

    const font = body.richText.attr.fontName, card = discuss.discussRemark, nickname = card;
    const sender = {
        user_id, nickname, card
    };

    let res;
    try {
        res = await getMsgFromElems(body.richText, c);
    } catch (e) {return}
    let {chain, raw_message} = res;

    if (!raw_message)
        return;

    c.logger.info(`recv from: [Discuss: ${discuss_name}(${discuss_id}), Member: ${card}(${user_id})] ` + raw_message);
    event.emit(c, "message.discuss", {
        discuss_id, discuss_name, user_id, message: chain, raw_message, font, sender, time
    });
}

async function getMsgFromElems(rich, c) {
    let res = parseMessage(rich);
    if (typeof res === "string") {
        const resp = await c.send(outgoing.buildMultiApplyDownRequestPacket(res, 1, c));
        res = await downloadRichMsg(resp);
        res = parseMessage(res.msg[0].body.richText);
    }
    return res;
}

//msg rsp----------------------------------------------------------------------------------------------------

function decodeSendMessageResponse(blob, c) {
    return pb.decode("PbSendMsgResp", blob);
}
function decodeDeleteMessageResponse(blob, c) {
    // console.log(pb.decode("PbDeleteMsgResp", blob))
}
function decodeRecallMessageResponse(blob, c) {
    //todo
}

//service----------------------------------------------------------------------------------------------------

function decodeImageStoreResponse(blob, c) {
    return pb.decode("D388RespBody", blob);
}
function decodeOffPicUpResponse(blob, c) {
    return pb.decode("OffPicUpRspBody", blob);
}
function decodePttUpResponse(blob, c) {
    return pb.decode("D388RespBody", blob);
}
function decodeMultiApplyUpResponse(blob, c) {
    return pb.decode("MultiRspBody", blob);
}
function decodeMultiApplyDownResponse(blob, c) {
    return pb.decode("MultiRspBody", blob);
}
function decodeGroupFileUrlResponse(blob, c) {
    return pb.decode("D6D6RspBody", pb.decode("OIDBSSOPkg", blob).bodybuffer);
}

module.exports = {
    getMsg, delMsg, sendMsg, recallMsg,
    onGroupMsg, onDiscussMsg
}
