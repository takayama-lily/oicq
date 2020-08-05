"use strict"
const crypto = require("crypto")
const tea = require('crypto-tea')

const rand = ()=>(Math.random()*1e9).toFixed()
const now = ()=>(Date.now()/1000).toFixed()
function alloc(sizes = []) {
    const buffers = []
    for (let i = 0; i < sizes.length; ++i) {
        buffers.push(Buffer.alloc(sizes[i]))
    }
    return buffers
}
// function tlv(id, t) {
//     t = Buffer.concat(t)
//     const head = alloc([2,2])
//     head[0].writeUInt16BE(id)
//     head[1].writeUInt16BE(t.length)
//     return Buffer.concat([Buffer.concat(head), t])
// }
function tlv(t) {
    t = Buffer.concat(t)
    const b = Buffer.alloc(2)
    b.writeUInt16BE(t.length)
    return Buffer.concat([b, t])
}

const t = {
    t1(uin, ip) {
        const t = alloc([2,4,4,4,4,2])
        t[0].writeUInt16BE(1)
        t[1].writeUInt32BE(rand())
        t[2].writeUInt32BE(uin)
        t[3].writeUInt32BE(now())
        t[4].writeUInt32BE(ip)
        t[5].writeUInt16BE(0)
        return Buffer.concat([Buffer.from([0x00,0x01]), tlv(t)])
    },
    t18(uin) {
        const t = alloc([2,4,4,4,4,2,2])
        t[0].writeUInt16BE(1)
        t[1].writeUInt32BE(1536)
        t[2].writeUInt32BE(16)
        t[3].writeUInt32BE(0)
        t[4].writeUInt32BE(uin)
        t[5].writeUInt16BE(0)
        t[6].writeUInt16BE(0)
        return Buffer.concat([Buffer.from([0x18]), tlv(t)])
    },
    t100() {
        const t = alloc([2,4,4,4,4,4])
        t[0].writeUInt16BE(1)
        t[1].writeUInt32BE(5)
        t[2].writeUInt32BE(16)
        t[3].writeUInt32BE(537062409)
        t[4].writeUInt32BE(0)
        t[5].writeUInt32BE(34869472)
        return Buffer.concat([Buffer.from([0x100]), tlv(t)])
    },
    t104(t) {
        return Buffer.concat([Buffer.from([0x104]), tlv(t)])
    },
    t106(uin, salt, password_md5, guid_available, guid, tgtgt_key) {
        const t = alloc([
            2,4,4,4,4,8,4,4,1,
            password_md5.length,
            tgtgt_key.length,
            4,1,16,4,4,2,8,2
        ])
        t[0].writeUInt16BE(4)
        t[1].writeUInt32BE(rand())
        t[2].writeUInt32BE(5)
        t[3].writeUInt32BE(16)
        t[4].writeUInt32BE(0)
        t[5].writeBigInt64BE(BigInt(uin?uin:uin))
        t[6].writeUInt32BE(now())
        t[7].writeUInt32BE(0x00000000)
        t[8].writeInt8(0x01)
        t[9] = password_md5
        t[10].write(tgtgt_key)
        t[11].writeUInt32BE(0)
        t[12].writeInt8(guid_available?0x01:0x00)
        if (guid.length) {
            t[13].write(guid)
        } else {
            t[13].writeUInt32BE(rand(), 0)
            t[13].writeUInt32BE(rand(), 4)
            t[13].writeUInt32BE(rand(), 8)
            t[13].writeUInt32BE(rand(), 12)
        }
        t[14].writeUInt32BE(537062409)
        t[15].writeUInt32BE(1)
        t[16].writeUInt16BE(8)
        t[17].writeBigInt64BE(BigInt(uin))
        t[18].writeUInt16BE(0)
        const key = crypto.createHash("md5").update(Buffer.concat([password_md5,Buffer.from([0x00,0x00,0x00,0x00,salt?salt:uin])])).digest()
        const v = tea.encrypt(Buffer.concat(t), key)
        return Buffer.concat([Buffer.from([0x01,0x06]), tlv([v])])
    },
    t107(pic_type) {
        const t = alloc([2,1,2,1])
        t[0].writeUInt16BE(pic_type)
        t[1].writeInt8(0x00)
        t[2].writeUInt16BE(0)
        t[3].writeInt8(0x01)
        return Buffer.concat([Buffer.from([0x01,0x07]), tlv(t)])
    },
    t109(android_id) {
        android_id = crypto.createHash("md5").update(android_id).digest()
        return Buffer.concat([Buffer.from([0x01,0x09]), tlv([android_id])])
    },
    t116(misc_bitmap, sub_sig_map) {
        const t = alloc([1,4,4,1,4])
        t[0].writeInt8(0x00)
        t[1].writeUInt32BE(misc_bitmap)
        t[2].writeUInt32BE(sub_sig_map)
        t[3].writeInt8(0x01)
        t[4].writeUInt32BE(1600000226)
        return Buffer.concat([Buffer.from([0x01,0x16]), tlv(t)])
    },
    t124(os_type, os_version, sim_info, apn) {},
    t128(isGuidFromFileNull, isGuidAvailable, isGuidChanged, guidFlag, buildModel, guid, buildBrand) {},
    t141(sim_info, apn) {
        const t = alloc([2,2,sim_info.length,2,2,apn.length])
        t[0].writeUInt16BE(1)
        t[1].writeUInt16BE(sim_info.length)
        t[2] = sim_info
        t[3].writeUInt16BE(2)
        t[4].writeUInt16BE(apn.length)
        t[5] = apn
        return Buffer.concat([Buffer.from([0x01,0x41]), tlv(t)])
    },
    t142(apk_id) {
        apk_id = Buffer.from(apk_id).slice(0, 32)
        const t = alloc([2,2,apk_id.length])
        t[0].writeUInt16BE(0)
        t[1].writeUInt16BE(apk_id.length)
        t[2] = apk_id
        return Buffer.concat([Buffer.from([0x01,0x42]), tlv(t)])
    },
    t145(guid) {
        const t = alloc([guid.length])
        t[0].write(guid)
        return Buffer.concat([Buffer.from([0x01,0x45]), tlv(t)])
    },
}

module.exports = t
console.log(t.t106(429245111,0,crypto.createHash("md5").update("552233").digest(),false,0,"222222"))
