"use strict";
const tea = require('crypto-tea');
const Writer = require("./writer");
const {rand, now, md5} = require("./common");

/**
 * @param {Number} tag
 * @param {Object} stream
 * @returns {Buffer}
 */
function tlv(tag, stream) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(stream.readableLength);
    stream.unshift(len);
    const serial = Buffer.alloc(2);
    serial.writeUInt16BE(tag);
    stream.unshift(serial);
    return stream.read();
}

module.exports = {
    /**
     * @param {Number} uin UInt32
     * @param {String|Number[]} ip 
     */
    0x01: function(uin, ip) {
        if (typeof ip === "string") {
            ip = ip.split(".");
            ip.forEach((v,i,arr)=>{
                arr[i] = parseInt(v);
            });
        }
        return tlv(
            0x01,
            new Writer()
            .writeU16(1)        // ip ver
            .writeU32(rand())
            .writeU32(uin)
            .writeU32(now())
            .writeBytes(Buffer.from(ip))
            .writeU16(0)
        );
    },
    0x02: function(captcha, sign) {
        return tlv(
            0x02,
            new Writer()
            .writeU16(0)        // sign ver
            .writeTlv(captcha)
            .writeTlv(sign)
        );
    },
    0x08: function(local_id) {
        return tlv(
            0x08,
            new Writer()
            .writeU16(0)
            .writeU32(local_id)
            .writeU16(0)
        );
    },
    0x18: function(appid, uin) {
        return tlv(
            0x18,
            new Writer()
            .writeU16(1)        // ping ver
            .writeU32(1536)     // sso ver
            .writeU32(appid)
            .writeU32(0)        // app client ver
            .writeU32(uin)
            .writeU16(0)        // const
            .writeU16(0)
        );
    },
    0x100: function(appid, sub_appid) {
        return tlv(
            0x100,
            new Writer()
            .writeU16(1)        // db buf ver
            .writeU32(5)        // sso ver
            .writeU32(appid)
            .writeU32(sub_appid)
            .writeU32(0)        // app client ver
            .writeU32(34869472) // sigmap
        );
    },
    0x104: function(buf) {
        return tlv(
            0x104,
            new Writer().writeBytes(buf)
        );
    },
    /**
     * @param {Number} appid UInt32
     * @param {Number} sub_appid UInt32
     * @param {Number} uin UInt32
     * @param {Number} salt UInt32
     * @param {Buffer} password_md5 
     * @param {Boolean} guid_available 
     * @param {Buffer|String} guid 
     * @param {Buffer|String} tgtgt_key 
     */
    0x106: function(appid, sub_appid, uin, salt, password_md5, guid_available, guid, tgtgt_key) {
        const body = new Writer()
            .writeU16(4)                                        // tgtgt ver
            .writeU32(rand())
            .writeU32(5)                                        // sso ver
            .writeU32(appid)
            .writeU32(0)                                        // app client ver
            .writeU64(uin)
            .writeU32(now())
            .writeBytes(Buffer.from([0,0,0,0]))  // dummy ip
            .writeU8(1)                                         // const
            .writeBytes(password_md5)
            .writeBytes(tgtgt_key)
            .writeU32(0)
            .writeBool(guid_available)
            .writeBytes(guid)
            .writeU32(sub_appid)
            .writeU32(1)    // login type password
            .writeU16(8)    // length of next field
            .writeU64(uin)
            .writeU16(0)
            .read();
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(salt?salt:uin);
        const key = md5(Buffer.concat([
            password_md5, Buffer.from([0x00,0x00,0x00,0x00]), buf
        ]));
        return tlv(
            0x106,
            new Writer().writeBytes(tea.encrypt(body, key))
        );
    },
    0x107: function(pic_type) {
        return tlv(
            0x107,
            new Writer()
            .writeU16(pic_type)
            .writeU8(0)     // const
            .writeU16(0)    // const
            .writeU8(1)     // const
        );
    },
    0x108: function(ksid) {
        return tlv(
            0x108,
            new Writer().writeBytes(ksid)
        );
    },
    0x109: function(android_id) {
        return tlv(
            0x109,
            new Writer().writeBytes(md5(Buffer.from(android_id)))
        );
    },
    0x112: function(non_number_uin) {
        return tlv(
            0x112,
            new Writer().writeBytes(non_number_uin)
        );
    },
    0x116: function(misc_bitmap, sub_sigmap) {
        return tlv(
            0x116,
            new Writer()
            .writeU8(0)          // ver
            .writeU32(misc_bitmap)
            .writeU32(sub_sigmap)
            .writeU8(1)          // size of app id list
            .writeU32(1600000226)// app id list[0]
        );
    },
    /**
     * @param {Buffer|String} os_type 
     * @param {Buffer|String} os_version 
     * @param {Buffer|String} sim_info 
     * @param {Buffer|String} apn 
     */
    0x124: function(os_type, os_version, sim_info, apn) {
        return tlv(
            0x124,
            new Writer()
            .writeTlv(os_type.slice(0, 16))
            .writeTlv(os_version.slice(0, 16))
            .writeU16(2)    // network type
            .writeTlv(sim_info.slice(0, 16))
            .writeTlv(Buffer.alloc(0))  // unknown
            .writeTlv(apn.slice(0, 16))
        );
    },
    /**
     * @param {Boolean} guid_null 
     * @param {Boolean} guid_available 
     * @param {Boolean} guid_changed 
     * @param {Number} guid_flag UInt32
     * @param {Buffer|String} build_model 
     * @param {Buffer|String} guid 
     * @param {Buffer|String} build_brand 
     */
    0x128: function(guid_null, guid_available, guid_changed, guid_flag, build_model, guid, build_brand) {
        return tlv(
            0x128,
            new Writer()
            .writeU16(0)
            .writeBool(guid_null)
            .writeBool(guid_available)
            .writeBool(guid_changed)
            .writeU32(guid_flag)
            .writeTlv(build_model.slice(0, 32))
            .writeTlv(guid.slice(0, 16))
            .writeTlv(build_brand.slice(0, 16))
        );
    },
    0x141: function(sim_info, apn) {
        return tlv(
            0x141,
            new Writer()
            .writeU16(1)        // ver
            .writeTlv(sim_info)
            .writeU16(2)        // network type
            .writeTlv(apn)
        );
    },
    0x142: function(apk_id) {
        return tlv(
            0x142,
            new Writer()
            .writeU16(0)    // ver
            .writeTlv(apk_id.slice(0, 32))
        );
    },
    0x144: function(
        android_id, device_info, os_type, os_version, sim_info, apn,
        guid_null, guid_available, guid_changed,
        guid_flag, build_model, guid, build_brand, tgtgt_key,
    ) {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(5);   // tlv cnt
        const body = Buffer.concat([
            buf,
            this[0x109](android_id),
            this[0x52d](device_info),
            this[0x124](os_type, os_version, sim_info, apn),
            this[0x128](guid_null, guid_available, guid_changed, guid_flag, build_model, guid, build_brand),
            this[0x16e](build_model),
        ]);
        return tlv(
            0x144,
            new Writer().writeBytes(tea.encrypt(body, tgtgt_key))
        );
    },
    0x145: function(guid) {
        return tlv(
            0x145,
            new Writer().writeBytes(guid)
        );
    },
    0x147: function(appid, apk_version_name, apk_sign_md5) {
        return tlv(
            0x147,
            new Writer()
            .writeU32(appid)
            .writeTlv(apk_version_name.slice(0, 32))
            .writeTlv(apk_sign_md5.slice(0, 32))
        );
    },
    0x154: function(seq_id) {
        return tlv(
            0x154,
            new Writer().writeU32(seq_id)
        );
    },
    0x166: function(image_type) {
        return tlv(
            0x166,
            new Writer().writeU8(image_type)
        );
    },
    0x16a: function(no_pic_sig) {
        return tlv(
            0x16a,
            new Writer().writeBytes(no_pic_sig)
        );
    },
    0x16e: function(build_model) {
        return tlv(
            0x16e,
            new Writer().writeBytes(build_model)
        );
    },
    0x172: function(rollback_sig) {
        return tlv(
            0x172,
            new Writer().writeBytes(rollback_sig)
        );
    },
    0x174: function(buf) {
        return tlv(
            0x174,
            new Writer().writeBytes(buf)
        );
    },
    0x177: function() {
        return tlv(
            0x177,
            new Writer()
            .writeU8(0x01)
            .writeU32(1571193922)   // unknown
            .writeTlv("6.0.0.2413") // unknown
        );
    },
    0x17a: function(uint32) {
        return tlv(
            0x17a,
            new Writer().writeU32(uint32)
        );
    },
    0x17c: function(buf) {
        return tlv(
            0x17c,
            new Writer().writeTlv(buf)
        );
    },
    0x185: function() {
        return tlv(
            0x185,
            new Writer().writeU8(1).writeU8(1)
        );
    },
    0x187: function(mac_address) {
        return tlv(
            0x187,
            new Writer().writeBytes(md5(Buffer.from(mac_address)))
        );
    },
    0x188: function(android_id) {
        return tlv(
            0x188,
            new Writer().writeBytes(md5(Buffer.from(android_id)))
        );
    },
    0x191: function(k = 0x82) {
        return tlv(
            0x191,
            new Writer().writeU8(k)
        );
    },
    0x193: function(ticket) {
        return tlv(
            0x193,
            new Writer().writeBytes(ticket)
        );
    },
    0x194: function(imsi_md5) {
        return tlv(
            0x194,
            new Writer().writeBytes(imsi_md5)
        );
    },
    0x197: function(buf) {
        return tlv(
            0x197,
            new Writer().writeBytes(buf)
        );
    },
    0x19e: function(uint8) {
        return tlv(
            0x19e,
            new Writer()
            .writeU16(1)
            .writeU8(uint8)
        );
    },
    0x201: function(l, channel_id, client_type, n) {
        return tlv(
            0x201,
            new Writer()
            .writeTlv(l)
            .writeTlv(channel_id)
            .writeTlv(client_type)
            .writeTlv(n)
        );
    },
    0x202: function(wifi_bssid, wifi_ssid) {
        return tlv(
            0x202,
            new Writer()
            .writeTlv(wifi_bssid.slice(0, 16))
            .writeTlv(wifi_ssid.slice(0, 32))
        );
    },
    0x318: function(tgt_qr) {
        return tlv(
            0x318,
            new Writer().writeBytes(tgt_qr)
        );
    },
    0x400: function(key, uin, guid, dpwd, appid, sub_appid, random_seed) {
        const body = new Writer()
            .writeBytes(guid)
            .writeBytes(dpwd)
            .writeU32(appid)
            .writeU32(sub_appid)
            .writeU64(Date.now())
            .writeBytes(random_seed)
            .read()
        return tlv(
            0x400,
            new Writer()
            .writeU8(1)     // ver
            .writeU64(uin)
            .writeBytes(tea.encrypt(body, key))
        );
    },
    0x401: function(d) {
        return tlv(
            0x401,
            new Writer().writeBytes(d)
        );
    },
    /**
     * @param {String[]} domains 
     */
    0x511: function(domains) {
        const stream = new Writer().writeU16(domains.length);
        for (let i = 0; i < domains.length; ++i) {
            let  v = domains[i];
            if (v === "") continue;
            if (!v.startsWith("(")) {
                stream.writeU8(0x01).writeTlv(v);
            } else {
                v = v.substr(1).split(")");
                const flag = parseInt(v[0]);
                let n = parseInt((flag && 0x100000) > 0)
                if ((flag && 0x8000000) > 0)
                    n |= 0x2
                stream.writeU8(n).writeTlv(v[1]);
            }
        }
        return tlv(
            0x511,
            stream
        )
    },
    0x516: function() {
        return tlv(
            0x516,
            new Writer().writeU32(0)    // const
        );
    },
    0x521: function() {
        return tlv(
            0x521,
            new Writer()
            .writeU32(0)    // product type
            .writeU16(0)    // const
        );
    },
    0x525: function(t536) {
        return tlv(
            0x525,
            new Writer()
            .writeU16(1)
            .writeBytes(t536)
        );
    },
    0x52d: function(device_info) {
        return tlv(
            0x52d,
            new Writer().writeBytes(device_info)
        );
    },
    0x536: function(login_extra_data) {
        return tlv(
            0x536,
            new Writer().writeBytes(login_extra_data)
        );
    }
};
