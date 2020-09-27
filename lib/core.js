/**
 * @param {Client} c 
 * @param {String} command_name 
 * @param {Buffer} body 
 * @param {Buffer} ext_data 
 * @returns {Buffer}
 */
function commonUNI(c, command_name, body, ext_data = BUF0) {
    c.logger.trace(`send:${command_name} seq:${c.seq_id}`);
    c.send_timestamp = Date.now();
    let uni = new Writer()
        .writeWithLength(command_name)
        .writeU32(8)
        .writeBytes(c.session_id)
        .writeWithLength(ext_data)
        .read();
    uni = new Writer().writeWithLength(uni).writeWithLength(body).read();
    uni = new Writer()
        .writeU32(0x0B)
        .writeU8(1) // body type
        .writeU32(c.seq_id)
        .writeU8(0)
        .writeWithLength(c.uin.toString())
        .writeBytes(tea.encrypt(uni, c.sign_info.d2key))
        .read();
    return new Writer().writeWithLength(uni).read();
}

/**
 * @param {Number} jcetype UInt8
 * @param {Number} jceseq UInt32
 * @param {Buffer} jcebuf 
 */
function buildConfPushResponsePacket(jcetype, jceseq, jcebuf, seq, c) {
    c.nextSeq();
    const PushResp = jce.encodeStruct([
        null, jcetype, jceseq, jcetype === 3 ? jcebuf : null
    ]);
    const extra = {
        req_id:  seq,
        service: "QQService.ConfigPushSvc.MainServant",
        method:  "PushResp",
    };
    const body = jce.encodeWrapper({PushResp}, extra);
    return commonUNI(c, CMD.PUSH_RESP, body);
}

/**
 * @param {Number} svrip
 * @param {Number} seq
 * @param {Buffer[]} rubbish 
 * @param {Buffer} jcebuf 
 */
function buildOnlinePushResponsePacket(svrip, seq, rubbish, c) {
    c.nextSeq();
    const resp = jce.encodeStruct([
        c.uin, rubbish, svrip, null, 0
    ]);
    const extra = {
        req_id:  seq,
        service: "OnlinePush",
        method:  "SvcRespPushMsg",
    };
    const body = jce.encodeWrapper({resp}, extra);
    return commonUNI(c, CMD.ONLINE_PUSHR, body, BUF0);
}

/**
 * @param {Buffer} buf 
 * @returns {Object}
 */
function parseSSO(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    stream.read(0);
    if (stream.read(4).readInt32BE() - 4 > stream.readableLength) {
        throw new Error("dropped");
    }
    const seq_id = stream.read(4).readInt32BE();
    const retcode = stream.read(4).readInt32BE();
    if (retcode) {
        throw new Error("return code unsuccessful: " + retcode);
    }
    stream.read(stream.read(4).readInt32BE() - 4);
    const command_name = stream.read(stream.read(4).readInt32BE() - 4).toString();
    const session_id = stream.read(stream.read(4).readInt32BE() - 4);
    if (command_name === "Heartbeat.Alive") {
        return {
            seq_id, command_name, session_id, payload: Buffer.alloc(0)
        };
    }

    const compressed = stream.read(4).readInt32BE();
    var payload;
    if (compressed === 0) {
        stream.read(4);
        payload = stream.read();
    } else if (compressed === 1) {
        stream.read(4);
        payload = zlib.unzipSync(stream.read());
    } else if (compressed === 8) {
        payload = stream.read();
    } else
        throw new Error("unknown compressed flag: " + compressed)
    return {
        seq_id, command_name, session_id, payload
    };
}

/**
 * @param {Buffer} buf 
 * @returns {Buffer}
 */
function parseOICQ(buf) {
    const stream = Readable.from(buf, {objectMode:false});
    if (stream.read(1).readUInt8() !== 2) {
        throw new Error("unknown flag");
    }
    stream.read(12);
    const encrypt_type = stream.read(2).readUInt16BE();
    stream.read(1)
    if (encrypt_type === 0) {
        const encrypted = stream.read(stream.readableLength - 1);
        let decrypted = tea.decrypt(encrypted, ecdh.share_key);
        return decrypted;
    } else if (encrypt_type === 4) {
        throw new Error("todo");
    } else
        throw new Error("unknown encryption method: " + encrypt_type);
}

function decodePushReqEvent(blob, c, seq) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    c.write(outgoing.buildConfPushResponsePacket(parent[1], parent[3], parent[2], seq, c));
    let ip, port;
    if (parent[1] === 1) {
        let server = jce.decode(parent[2])[1][0];
        server = jce.decode(server);
        ip = server[0], port = server[1];
    }
    //更换服务器理论上可以获得更好的性能和连接稳定性，一般来说无视这个包也没什么问题
    //据说前段时间服务器不稳定导致的频繁掉线和这个有关
    event.emit(c, "internal.change-server", {ip, port});
}

function decodePushNotifyEvent(blob, c) {
    if (!c.sync_finished) return;
    const nested = jce.decodeWrapper(blob.slice(15));
    const parent = jce.decode(nested);
    switch (parent[5]) {
        case 33:
        case 141:
        case 166:
        case 167:
            c.write(outgoing.buildGetMessageRequestPacket(0, c));
            break;
        case 84:
        case 87:
            c.write(outgoing.buildNewGroupRequestPacket(c));
            break;
        case 187:
            c.write(outgoing.buildNewFriendRequestPacket(c));
            break;
    }
}

//online push------------------------------------------------------------------------------------------------

function decodeOnlinePushEvent(blob, c, seq) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const list = parent[2];
    const rubbish = [];
    for (let v of list) {
        v = jce.decode(v);
        rubbish.push(jce.encodeNested([
            c.uin, v[1], v[3], v[8], 0,0,0,0,0,0,0
        ]))
        if (!c.sync_finished) continue;
        const time = v[5];
        if (v[2] === 528) {
            let data = jce.decode(v[6]);
            if (data[0] === 0x8A || data[0] === 0x8B) {
                data = pb.decode("Sub8A", data[10]);
                data = data.msgInfo[0];
                const user_id = toInt(data.fromUin);
                event.emit(c, "notice.friend.recall", {
                    user_id, message_id: common.genGroupMessageId(user_id, data.msgSeq, data.msgRandom)
                });
            } else if (data[0] === 0xB3) {
                data = pb.decode("SubB3", data[10]);
                const user_id = toInt(data.msgAddFrdNotify.uin), nickname = data.msgAddFrdNotify.nick;
                c.fl.set(user_id, {
                    user_id, nickname,
                    sex: "unknown",
                    age: 0,
                    area: "unknown",
                    remark: nickname,
                });
                c.sl.delete(user_id);
                c.getStrangerInfo(user_id);
                c.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`);
                event.emit(c, "notice.friend.increase", {
                    user_id, nickname
                });
            } else if (data[0] === 0xD4) {
                data = pb.decode("SubD4", data[10]);
                const group_id = toInt(data.groupCode);
                c.getGroupInfo(group_id, true);
            }
            if (data[0] === 0x3B) {
                data = pb.decode("Sub3B", data[10])
                const group_id = toInt(data.groupCode);
                event.emit(c, "notice.group.setting", {
                    group_id, user_id: -1,
                    enable_show_title: data.enableShowTitle > 0
                });
            }
            if (data[0] === 0x44) {}
            if (data[0] === 0x27) {
                data = pb.decode("Sub27", data[10]).sub27[0];
                if (data.type === 80) {
                    const o = data.msgNewGrpName;
                    const group_id = toInt(o.groupCode);
                    if (!o.authUin)
                        continue;
                    try {
                        c.gl.get(group_id).group_name = o.entry.name;
                    } catch (e) {}
                    event.emit(c, "notice.group.setting", {
                        group_id,
                        user_id: toInt(o.authUin),
                        group_name: o.entry.name
                    });
                }
                if (data.type === 5) {
                    let user_id = toInt(data.msgDelFrdNotify.uin), nickname = null;
                    try {
                        nickname = c.fl.get(user_id).nickname;
                        c.fl.delete(user_id);
                    } catch (e) {}
                    c.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`);
                    event.emit(c, "notice.friend.decrease", {
                        user_id, nickname
                    });
                }
                if (data.type === 20) {
                    // 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡
                    const user_id = toInt(data.msgProfile.uin);
                    const o = data.msgProfile.profile;
                    let key, value;
                    if (o.type === 20002) {
                        key = "nickname";
                        value = o.value.toString();
                    } else if (o.type === 20009) {
                        key = "sex";
                        value = friend_sex_map[o.value[0]];
                    } else if (o.type === 20031) {
                        key = "age";
                        value = new Date().getFullYear() - o.value.readUInt16BE();
                    } else if (o.type === 20019) {
                        key = "description";
                        value = o.value.toString();
                    } else {
                        continue;
                    }
                    try {
                        c.fl.get(user_id)[key] = value;
                    } catch (e) {}
                    if (user_id === c.uin)
                        c[key] = value;
                    else {
                        const e = {user_id};
                        e[key] = value;
                        event.emit(c, "notice.friend.profile", e);
                    }
                }
                if (data.type === 60) {
                    const user_id = toInt(data.msgNewSign.uin);
                    const sign = data.msgNewSign.sign;
                    try {
                        c.fl.get(user_id).signature = sign;
                    } catch (e) {}
                    if (user_id === c.uin)
                        c.signature = sign;
                    else
                        event.emit(c, "notice.friend.profile", {
                            user_id, signature: sign
                        });
                }
                if (data.type === 40) {
                    try {
                        const o = data.msgNewRemark.entry, uin = toInt(o.uin);
                        if (o.type > 0) continue; //0好友备注 1群备注
                        c.fl.get(uin).remark = o.remark;
                    } catch (e) {}
                }
                if (data.type === 21) {
                    // 群头像增加 <Buffer 0a 1a 08 00 10 15 5a 14 08 01 10 9f dd 95 a1 04 18 9f dd 95 a1 04 20 f5 ef e8 b1 01>
                }
                
            }
        } else if (v[2] === 732) {
            const group_id = v[6].readUInt32BE();
            if (v[6][4] === 0x0C) {
                const operator_id = v[6].readUInt32BE(6);
                const user_id = v[6].readUInt32BE(16);
                const duration = v[6].readUInt32BE(20);
                try {
                    if (user_id === 0)
                        c.gl.get(group_id).shutup_time_whole = duration & 0xffffffff;
                    else if (user_id === c.uin)
                        c.gl.get(group_id).shutup_time_me = duration ? (time + duration) : 0;
                } catch (e) {}
                event.emit(c, "notice.group.ban", {
                    group_id, operator_id, user_id, duration
                });
            }
            if (v[6][4] === 0x11) {
                const data = pb.decode("NotifyMsgBody", v[6].slice(7));
                const operator_id = toInt(data.optMsgRecall.uin);
                const msg = data.optMsgRecall.recalledMsgList[0];
                const user_id = toInt(msg.authorUin);
                const message_id = common.genGroupMessageId(group_id, msg.seq, msg.msgRandom);
                event.emit(c, "notice.group.recall", {
                    group_id, user_id, operator_id, message_id
                });
            }
            if (v[6][4] === 0x14) {
                const data = pb.decode("NotifyMsgBody", v[6].slice(7));
                if (data.optGeneralGrayTip) {
                    let user_id, operator_id, action, suffix;
                    for (let k in data.optGeneralGrayTip.msgTemplParam) {
                        const o = data.optGeneralGrayTip.msgTemplParam[k]
                        if (o.name === "action_str")
                            action = o.value;
                        if (o.name === "uin_str1")
                            operator_id = parseInt(o.value);
                        if (o.name === "uin_str2")
                            user_id = parseInt(o.value);
                        if (o.name === "suffix_str")
                            suffix = o.value;
                    }
                    if (!operator_id)
                        continue;
                    if (!user_id)
                        user_id = c.uin;
                    event.emit(c, "notice.group.poke", {
                        group_id, user_id, operator_id, action, suffix
                    });
                }
            }

            const o = v[6];
            let user_id, field, enable;
            if (o[4] === 0x06 && o[5] === 1) {
                field = "enable_guest", enable = o[10] > 0;
                user_id = o.readUInt32BE(6);
            }
            else if (o[4] === 0x0e && o[5] === 1) {
                field = "enable_anonymous", enable = o[10] === 0;
                user_id = o.readUInt32BE(6);
            }
            else if (o[4] === 0x0f) {
                if (o[12] === 1)
                    field = "enable_upload_album";
                else if (o[12] === 2)
                    field = "enable_upload_file";
                enable = o[8] === 0x0 || o[8] === 0x20;
                user_id = c.gl.get(group_id).owner_id;
            }
            else if (o[4] === 0x10) {
                const sub = pb.decode("Sub10", o.slice(7));
                if (sub.entry && sub.entry.text) {
                    let str = sub.entry.text;
                    user_id = str.includes("群主") ? c.gl.get(group_id).owner_id : -1;
                    if (str.includes("获得群主授予的")) {
                        user_id = toInt(sub.entry.uin);
                        str = str.substr(0, str.length - 2);
                        const title = str.substr(str.lastIndexOf("获得群主授予的") + 7);
                        str = str.substr(0, str.length - title.length - 7);
                        const nickname = str.substr(2);
                        try {
                            c.gml.get(group_id).get(user_id).title = title;
                            c.gml.get(group_id).get(user_id).title_expire_time = -1;
                        } catch(e) {}
                        event.emit(c, "notice.group.title", {
                            group_id, user_id,
                            nickname, title
                        });
                        continue;
                    } else if (str.includes("坦白说")) {
                        field = "enable_confess";
                        enable = str.includes("开启");
                    } else if (str.includes("临时会话")) {
                        field = "enable_temp_chat";
                        enable = str.includes("允许");
                    } else if (str.includes("新的群聊")) {
                        field = "enable_new_group";
                        enable = str.includes("允许");
                    }
                }
                if (o[6] === 0x22) {
                    if (o[o.length - 2] === 0x08)
                        field = "enable_show_honor";
                    if (o[o.length - 2] === 0x10)
                        field = "enable_show_level";
                    enable = o[o.length - 1] === 0;
                    user_id = -1;
                }
                if (o[6] === 0x26) {
                    // 改群分类 <Buffer 44 25 6e 9f 10 00 26 08 18 10 96 8a e3 fa 05 18 ff ff ff ff 0f 20 9f dd 95 a1 04 68 17 a8 01 f5 ef e8 b1 01 f2 01 06 18 8c 04 40 9a 4e>
                }
            } else {
                continue;
            }
            if (field && enable !== undefined) {
                const e = {
                    group_id, user_id
                };
                e[field] = enable;
                event.emit(c, "notice.group.setting", e);
            }
        }
    }
    c.write(outgoing.buildOnlinePushResponsePacket(parent[3], seq, rubbish, c));
}
async function decodeOnlinePushTransEvent(blob, c, seq) {
    const o = pb.decode("TransMsgInfo", blob);
    c.write(outgoing.buildOnlinePushResponsePacket(o.svrIp, seq, [], c));
    if (!c.sync_finished) return;
    const time = toInt(o.realMsgTime);
    const buf = o.msgData;
    const group_id = buf.readUInt32BE();
    if (o.msgType === 44) {
        if (buf[5] === 0 || buf[5] === 1) {
            const user_id = buf.readUInt32BE(6);
            const set = buf[10] > 0;
            try {
                (await c.getGroupMemberInfo(group_id, user_id)).data.role = (set ? "admin" : "member");
            } catch (e) {}
            event.emit(c, "notice.group.admin", {
                group_id, user_id, set, time
            });
        } else if (buf[5] === 0xFF) {
            const operator_id = buf.readUInt32BE(6);
            const user_id = buf.readUInt32BE(10);
            try {
                c.gl.get(group_id).owner_id = user_id;
                (await c.getGroupMemberInfo(group_id, operator_id)).data.role = "member";
                (await c.getGroupMemberInfo(group_id, user_id)).data.role = "owner";
            } catch (e) {}
            event.emit(c, "notice.group.transfer", {
                group_id, operator_id, user_id, time
            });
        }
    }
    if (o.msgType === 34) {
        const user_id = buf.readUInt32BE(5);
        let operator_id, dismiss = false;
        if (buf[9] === 0x82 || buf[9] === 0x2) {
            operator_id = user_id;
            try {
                c.gml.get(group_id).delete(user_id);
            } catch (e) {}
        } else {
            operator_id = buf.readUInt32BE(10);
            if (buf[9] === 0x01)
                dismiss = true;
            if (user_id === c.uin) {
                c.gl.delete(group_id);
                c.gml.delete(group_id);
                c.logger.info(`更新了群列表，删除了群：${group_id}`);
            } else {
                try {
                    c.gml.get(group_id).delete(user_id);
                } catch (e) {}
            }
        }
        try {
            c.gl.get(group_id).member_count--;
        } catch (e) {}
        event.emit(c, "notice.group.decrease", {
            group_id, user_id, operator_id, dismiss, time
        });
    }
}

//offline----------------------------------------------------------------------------------------------------

function decodeForceOfflineEvent(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    event.emit(c, "internal.kickoff", {
        type: "PushForceOffline",
        info: `[${parent[1]}]${parent[2]}`,
    });
}
function decodeReqMSFOfflineEvent(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    if (parent[3].includes("如非本人操作，则密码可能已泄露"))
        return;
    event.emit(c, "internal.kickoff", {
        type: "ReqMSFOffline",
        info: `[${parent[4]}]${parent[3]}`,
    });
}

//----------------------------------------------------------------------------------------------

/**
 * @param {Buffer} packet 
 * @param {Client}
 * @returns {void}
 */
module.exports = function parseIncomingPacket(packet, c) {
    const stream = Readable.from(packet, {objectMode:false});
    const flag1 = stream.read(4).readInt32BE();
    if (flag1 !== 0x0A && flag1 !== 0x0B)
        throw new Error("decrypt failed");
    const flag2 = stream.read(1).readUInt8();
    const flag3 = stream.read(1).readUInt8();
    if (flag3 !== 0)
        throw new Error("unknown flag");
    stream.read(stream.read(4).readInt32BE() - 4);
    let decrypted = stream.read();
    switch (flag2) {
        case 0:
            break;
        case 1:
            decrypted = tea.decrypt(decrypted, c.sign_info.d2key);
            break;
        case 2:
            decrypted = tea.decrypt(decrypted, Buffer.alloc(16));
            break;
        default:
            decrypted = Buffer.alloc(0)
            break;
    }
    if (!decrypted.length)
        throw new Error("decrypt failed");
 
    const sso = parseSSO(decrypted);
    c.logger.trace(`recv:${sso.command_name} seq:${sso.seq_id}`);

    let ret;
    if (flag2 === 2)
        sso.payload = parseOICQ(sso.payload);
    if (decoders.has(sso.command_name))
        ret = decoders.get(sso.command_name)(sso.payload, c, sso.seq_id);
    else
        unknownDebug(sso.payload);
    if (c.handlers.has(sso.seq_id))
        c.handlers.get(sso.seq_id)(ret);
};

function unknownDebug(blob) {
    // const nested = jce.decodeWrapper(blob);
    // const parent = jce.decode(nested);
    // common.log(parent)
    // common.log(blob.toString("hex").replace(/(.)(.)/g, '$1$2 '));
}
