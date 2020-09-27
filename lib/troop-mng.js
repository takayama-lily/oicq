//grp op----------------------------------------------------------------------------------------------------

function buildSetGroupAdminRequestPacket(group_id, user_id, enable, c) {
    c.nextSeq();
    const buf = Buffer.alloc(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable?1:0, 8);
    const body = pb.encode("OIDBSSOPkg", {
        command: 1372,
        serviceType: 1,
        bodybuffer: buf,
    });
    return commonUNI(c, CMD.GROUP_ADMIN, body);
}
function buildEditSpecialTitleRequestPacket(group_id, user_id, title, duration, c) {
    c.nextSeq();
    title = Buffer.from(title.toString());
    duration = parseInt(duration);
    const body = pb.encode("OIDBSSOPkg", {
        command: 2300,
        serviceType: 2,
        bodybuffer: pb.encode("D8FCReqBody", {
            groupCode: group_id,
            memLevelInfo: [{
                uin: user_id,
                uinName: title,
                specialTitle: title,
                specialTitleExpireTime: duration&0xffffffff
            }]
        }),
    });
    return commonUNI(c, CMD.GROUP_TITLE, body);
}

function buildGroupSettingRequestPacket(group_id, k, v, c) {
    c.nextSeq();
    const qwerty = {
        groupCode: parseInt(group_id),
		stGroupInfo: {},
    };
    qwerty.stGroupInfo[k] = v;
    const body = pb.encode("OIDBSSOPkg", {
        command:    2202,
        bodybuffer: pb.encode("D89AReqBody", qwerty),
    });
    return commonUNI(c, CMD.GROUP_SETTING, body);
}

function buildEditGroupCardRequestPacket(group_id, user_id, card, c) {
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, card?card.toString():"", 0, "", "", ""
            ])
        ]
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "mqq.IMService.FriendListServiceServantObj",
        method:  "ModifyGroupCardReq",
    };
    const body = jce.encodeWrapper({MGCREQ}, extra);
    return commonUNI(c, CMD.GROUP_CARD, body);
}

function buildGroupKickRequestPacket(group_id, user_id, block, c) {
    c.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:    2208,
        bodybuffer: pb.encode("D8A0ReqBody", {
            optUint64GroupCode: group_id,
            msgKickList:        [{
                optUint32Operate:   5,
                optUint64MemberUin: user_id,
                optUint32Flag:      block?1:0,
            }],
            kickMsg:            BUF0
        })
    });
    return commonUNI(c, CMD.GROUP_KICK, body);
}
function buildGroupBanRequestPacket(group_id, user_id, duration, c) {
    c.nextSeq();
    const buf = Buffer.alloc(15);
    buf.writeUInt32BE(group_id), buf.writeUInt8(32, 4), buf.writeUInt16BE(1, 5);
    buf.writeUInt32BE(user_id, 7), buf.writeUInt32BE(duration, 11);
    const body = pb.encode("OIDBSSOPkg", {
        command:     1392,
        serviceType: 8,
        bodybuffer:  buf
    });
    return commonUNI(c, CMD.GROUP_BAN, body);
}
function buildGroupLeaveRequestPacket(group_id, dismiss, c) {
    let command, buf = Buffer.alloc(8);
    if (dismiss) {
        command = 9;
        buf.writeUInt32BE(group_id), buf.writeUInt32BE(c.uin, 4);
    } else {
        command = 2;
        buf.writeUInt32BE(c.uin), buf.writeUInt32BE(group_id, 4);
    }
    const GroupMngReq = jce.encodeStruct([
        command, c.uin, buf
    ]);
    const extra = {
        req_id:  c.nextSeq(),
        service: "KQQ.ProfileService.ProfileServantObj",
        method:  "GroupMngReq",
    };
    const body = jce.encodeWrapper({GroupMngReq}, extra);
    return commonUNI(c, CMD.GROUP_MNG, body);
}

function buildGroupPokeRequestPacket(group_id, user_id, c) {
    c.nextSeq();
    const body = pb.encode("OIDBSSOPkg", {
        command:     3795,
        serviceType: 1,
        bodybuffer:  pb.encode("DED3ReqBody", {
            toUin: user_id,
            groupCode: group_id
        })
    });
    return commonUNI(c, CMD.GROUP_POKE, body);
}

//grp op rsp----------------------------------------------------------------------------------------------------

function decodeEditGroupCardResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[3].length > 0;
}

/**
 * @returns {boolean}
 */
function decodeGroupAdminResponse(blob, c) {
    const o = pb.decode("OIDBSSOPkg", blob);
    return o.result === 0;
}

/**
 * @returns {boolean}
 */
function decodeSpecialTitleResponse(blob, c) {
    const o = pb.decode("OIDBSSOPkg", blob);
    return o.result === 0;
}

/**
 * @returns {boolean}
 */
function decodeGroupMngResponse(blob, c) {
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return parent[1] === 0;
}
/**
 * @returns {boolean}
 */
function decodeGroupKickResponse(blob, c) {
    const o = pb.decode("OIDBSSOPkg", blob);
    const body = pb.decode("D8A0RspBody", o.bodybuffer);
    return body.msgKickResult[0].optUint32Result === 0;
}
function decodeGroupBanResponse(blob, c) {
    //无法通过返回值知晓结果
}

module.exports = {
    setAdmin, setTitle, setCard, kick, ban, leave, poke, setting
}
