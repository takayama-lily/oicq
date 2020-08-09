"use strict"
const tea = require('crypto-tea')
const tlv = require("./tlv")
const Writer = require("./writer")

function buildOicqRequestPacket(uin, command_id, encrypt, key, body) {
    return new Writer()
        .writeU8(0x02)
        .writeU16(29 + Buffer.byteLength(body))
        .writeU16(8001)
        .writeU16(command_id)
        .writeU16(1)
        .writeU32(uin)
        .writeU8(3)
        .writeU8(encrypt.Id())
        .writeU8(0)
        .writeU32(2)
        .writeU32(0)
        .writeU32(0)
        .write(body)
        .writeU8(0x03)
        .read()
}

function buildSsoPacket(seq, command_name, imei, extData, session_id, body, ksid) {
    const stream = new Writer()
    const head = (function(){
        const stream = new Writer()
        stream.writeU32(seq)
            .writeU32(537062409)
            .writeU32(537062409)
            .writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]))
        if (!extData.length || extData.length === 4) stream.writeU32(0x04)
        else stream.writeU32(extData.length+4).writeBytes(extData)
        return stream.writeStr(command_name)
            .writeU32(0x08)
            .writeBytes(session_id)
            .writeStr(imei)
            .writeU32(0x04)
            .writeU16(ksid.length+2)
            .writeBytes(ksid)
            .writeU32(0x04)
            .read()
    })()
    return stream.writeU32(head.length+4)
        .writeBytes(head)
        .writeU32(body.length+4)
        .writeBytes(body)
        .read()
}

function buildLoginPacket(uin, bodyType, key, body, ext_data) {
    const stream = new Writer()
    const buf = (function() {
        return new Writer()
            .writeU32(0x00_00_00_0A)
            .writeU8(bodyType)
            .writeU32(ext_data.length+4)
            .writeBytes(ext_data)
            .writeU8(0x00)
            .writeStr(uin.toString(10))
            .writeBytes(key.length?tea.encrypt(body, key):body)
            .read()
    })()
    return stream.writeU32(buf.length+4)
        .writeBytes(buf)
        .read()
}

//----------------------------------------------------------------------------------------

function bulidPasswordLoginPacket(client) {
    const stream = new Writer()
    stream.writeU16(9).writeU16(17)
        .writeBytes(tlv[0x018](client.uin))
        .writeBytes(tlv[0x001](client.uin, SystemDeviceInfo.IpAddress))
        .writeBytes(tlv[0x106](client.uin, 0, client.password_md5, true, SystemDeviceInfo.Guid, SystemDeviceInfo.TgtgtKey))
        .writeBytes(tlv[0x116](184024956, 0x10400))
        .writeBytes(tlv[0x100]())
        .writeBytes(tlv[0x107](0))
        .writeBytes(tlv[0x142]("com.tencent.mobileqq"))
        .writeBytes(tlv[0x144](
            SystemDeviceInfo.AndroidId,
            SystemDeviceInfo.GenDeviceInfoData(),
            SystemDeviceInfo.OSType,
            SystemDeviceInfo.Version.Release,
            SystemDeviceInfo.SimInfo,
            SystemDeviceInfo.APN,
            false, true, false, tlv.GuidFlag(),
            SystemDeviceInfo.Model,
            SystemDeviceInfo.Guid,
            SystemDeviceInfo.Brand,
            SystemDeviceInfo.TgtgtKey,
        ))
        .writeBytes(tlv[0x145](SystemDeviceInfo.Guid))
        .writeBytes(tlv[0x147](16, Buffer.from("8.2.7"), Buffer.from([0xA6, 0xB7, 0x45, 0xBF, 0x24, 0xA2, 0xC2, 0x77, 0x52, 0x77, 0x16, 0xF6, 0xF3, 0x6E, 0xB6, 0x8D])))
        .writeBytes(tlv[0x154](client.seq_id))
        .writeBytes(tlv[0x141](SystemDeviceInfo.SimInfo, SystemDeviceInfo.APN))
        .writeBytes(tlv[0x008](2052))
        .writeBytes(tlv[0x511]([
            "tenpay.com", "openmobile.qq.com", "docs.qq.com", "connect.qq.com",
            "qzone.qq.com", "vip.qq.com", "qun.qq.com", "game.qq.com", "qqweb.qq.com",
            "office.qq.com", "ti.qq.com", "mail.qq.com", "qzone.com", "mma.qq.com",
        ]))
        .writeBytes(tlv[0x187](SystemDeviceInfo.MacAddress))
        .writeBytes(tlv[0x188](SystemDeviceInfo.AndroidId))

    if (SystemDeviceInfo.IMSIMd5.length) {
        stream.writeBytes(tlv[0x194](SystemDeviceInfo.IMSIMd5))
    }
    stream.writeBytes(tlv[0x191](0x82))
    if (SystemDeviceInfo.WifiBSSID.length && ystemDeviceInfo.WifiSSID.length) {
        stream.writeBytes(tlv[0x202](SystemDeviceInfo.WifiBSSID, SystemDeviceInfo.WifiSSID))
    }
    stream.writeBytes(tlv[0x177]())
        .writeBytes(tlv[0x516]())
        .writeBytes(tlv[0x521]())
        .writeBytes(tlv[0x525](tlv[0x536](Buffer.from([0x01, 0x00]))))

    const req = buildOicqRequestPacket(
        client.uin, 0x0810, "md5", client.random_key, stream.read()
    )
    const sso = buildSsoPacket(
        client.seq_id, "wtlogin.login", SystemDeviceInfo.IMEI, Buffer.alloc(0), client.session_id, req, client.ksid
    )
    return buildLoginPacket(
        client.uin, 2, Buffer.alloc(16), sso, Buffer.alloc(0)
    )
}
