"use strict"
const tea = require('crypto-tea')
const Writer = require("./writer")
const {rand, now, md5} = require("../common")

function _tlv(stream) {
    let buf = Buffer.alloc(2)
    buf.writeUInt16BE(stream.readableLength)
    stream.unshift(buf)
    return stream
}
function tlv(id, stream) {
    _tlv(stream)
    let buf = Buffer.alloc(2)
    buf.writeUInt16BE(id)
    stream.unshift(buf)
    return stream.read()
}

const t = {
    0x1: function(uin, ip) {
        return tlv(
            0x01,
            new Writer()
            .writeU16(1)
            .writeU32(rand())
            .writeU32(uin)
            .writeU32(now())
            .writeU32(ip)
            .writeU16(0)
        )
    },
    0x18: function(uin) {
        return tlv(
            0x18,
            new Writer()
            .writeU16(1)
            .writeU32(1536)
            .writeU32(16)
            .writeU32(0)
            .writeU32(uin)
            .writeU16(0)
            .writeU16(0)
        )
    },
    0x100: function() {
        return tlv(
            0x100,
            new Writer()
            .writeU16(1)
            .writeU32(5)
            .writeU32(16)
            .writeU32(537062409)
            .writeU32(0)
            .writeU32(34869472)
        )
    },
    0x104: function(buf) {
        return tlv(
            0x104,
            new Writer().writeBytes(buf)
        )
    },
    0x106: function(uin, salt, password_md5, guid_available, guid, tgtgt_key) {
        const body = (function() {
            const stream = new Writer()
            stream.writeU16(4)
                .writeU32(rand())
                .writeU32(5)
                .writeU32(16)
                .writeU32(0)
                .writeU64(uin?uin:salt)
                .writeU32(now())
                .writeU32(0x00000000)
                .writeU8(0x01)
                .writeBytes(password_md5)
                .writeBytes(tgtgt_key)
                .writeU32(0)
                .writeBool(guid_available)
            if (guid.length) {
                stream.writeBytes(guid)
            } else {
                stream.writeU32(rand())
                    .writeU32(rand())
                    .writeU32(rand())
                    .writeU32(rand())
            }
            return stream.writeU32(537062409)
                .writeU32(1)
                .writeU16(8)
                .writeU64(uin)
                .writeU16(0)
                .read()
        })()
        const buf = Buffer.alloc(4)
        buf.writeUInt32BE(salt?salt:uin)
        const key = md5(Buffer.concat([
            password_md5, Buffer.from([0x00,0x00,0x00,0x00]), buf
        ]))
        return tlv(
            0x106,
            new Writer().writeBytes(tea.encrypt(body, key))
        )
    },
    0x107: function(pic_type) {
        return tlv(
            0x107,
            new Writer()
            .writeU16(pic_type)
            .writeU8(0x00)
            .writeU16(0)
            .writeU8(0x01)
        )
    },
    0x109: function(android_id) {
        return tlv(
            0x109,
            new Writer().writeBytes(md5(android_id))
        )
    },
    0x116: function(misc_bitmap, sub_sigmap) {
        return tlv(
            0x116,
            new Writer()
            .writeU8(0x00)
            .writeU32(misc_bitmap)
            .writeU32(sub_sigmap)
            .writeU8(0x01)
            .writeU32(1600000226)
        )
    },
    0x124: function(os_type, os_version, sim_info, apn) {},
    0x128: function(isGuidFromFileNull, isGuidAvailable, isGuidChanged, guidFlag, buildModel, guid, buildBrand) {},
    0x141: function(sim_info, apn) {
        return tlv(
            0x141,
            new Writer()
            .writeU16(1)
            .writeU16(sim_info.length)
            .writeBytes(sim_info)
            .writeU16(2)
            .writeU16(apn.length)
            .writeBytes(apn)
        )
    },
    0x142: function(apk_id) {
        apk_id = Buffer.from(apk_id).slice(0, 32)
        return tlv(
            0x142,
            new Writer()
            .writeU16(0)
            .writeU16(apk_id.length)
            .writeBytes(apk_id)
        )
    },
    0x144: function(
        androidId, devInfo, osType, osVersion, simInfo, apn,
        isGuidFromFileNull, isGuidAvailable, isGuidChanged,
        guidFlag, buildModel, guid, buildBrand, tgtgtKey,
    ) {
        const body = Buffer.concat([
            Buffer.from([0x00, 0x05]),
            this[0x109](androidId),
            this[0x52d](devInfo),
            this[0x124](osType, osVersion, simInfo, apn),
            this[0x128](isGuidFromFileNull, isGuidAvailable, isGuidChanged, guidFlag, buildModel, guid, buildBrand),
            this[0x16e](buildModel),
        ])
        return tlv(
            0x144,
            new Writer().writeBytes(tea.encrypt(body, tgtgtKey))
        )
    },
    0x145: function(guid) {
        return tlv(
            0x145,
            new Writer().writeBytes(guid)
        )
    },
}

module.exports = t
// console.log(t[0x106](123456789,0,md5("123456"),false,0,"222222"))
// console.log(t[0x18](465168165))

