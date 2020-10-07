"use strict";
const crypto = require("crypto");
const tea = require('crypto-tea');
const Writer = require("./writer");
const {now, md5} = require("../common");
const pb = require("../pb");

function tlv(tag, ...args) {
    const stream = tlvs[tag].apply(this, args);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(stream.readableLength);
    stream.unshift(len);
    const series = Buffer.alloc(2);
    series.writeUInt16BE(tag);
    stream.unshift(series);
    return stream.read();
}

const tlvs = {
    0x01: function() {
        let ip = this.device.ip_address.split(".");
        ip.forEach((v,i,arr)=>{
            arr[i] = parseInt(v);
        });
        return new Writer()
            .writeU16(1)        // ip ver
            .writeBytes(crypto.randomBytes(4))
            .writeU32(this.uin)
            .writeU32(now())
            .writeBytes(Buffer.from(ip))
            .writeU16(0);
    },
    0x02: function(captcha) {
        return new Writer()
            .writeU16(0)        // sign ver
            .writeTlv(captcha)
            .writeTlv(this.captcha_sign);
    },
    0x08: function() {
        return new Writer()
            .writeU16(0)
            .writeU32(2052)
            .writeU16(0);
    },
    0x18: function() {
        return new Writer()
            .writeU16(1)        // ping ver
            .writeU32(1536)     // sso ver
            .writeU32(this.appid)
            .writeU32(0)        // app client ver
            .writeU32(this.uin)
            .writeU16(0)        // const
            .writeU16(0);
    },
    0x100: function() {
        return new Writer()
            .writeU16(1)        // db buf ver
            .writeU32(5)        // sso ver
            .writeU32(this.appid)
            .writeU32(this.sub_appid)
            .writeU32(0)        // app client ver
            .writeU32(34869472);// sigmap
    },
    0x104: function(buf) {
        return new Writer().writeBytes(buf);
    },
    0x106: function() {
        const body = new Writer()
            .writeU16(4)                        // tgtgt ver
            .writeBytes(crypto.randomBytes(4))
            .writeU32(5)                        // sso ver
            .writeU32(this.appid)
            .writeU32(0)                        // app client ver
            .writeU64(this.uin)
            .writeU32(now())
            .writeBytes(Buffer.from([0,0,0,0])) // dummy ip
            .writeU8(1)                         // const
            .writeBytes(this.password_md5)
            .writeBytes(this.device.tgtgt_key)
            .writeU32(0)
            .writeBool(1)
            .writeBytes(this.device.guid)
            .writeU32(this.sub_appid)
            .writeU32(1)    // login type password
            .writeU16(8)    // length of next field
            .writeU64(this.uin)
            .writeU16(0)
            .read();
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(this.uin);
        const key = md5(Buffer.concat([
            this.password_md5, Buffer.from([0x00,0x00,0x00,0x00]), buf
        ]));
        return new Writer().writeBytes(tea.encrypt(body, key));
    },
    0x107: function() {
        return new Writer()
            .writeU16(0)    // pic_type
            .writeU8(0)     // const
            .writeU16(0)    // const
            .writeU8(1);    // const
    },
    0x108: function() {
        return new Writer().writeBytes(this.ksid);
    },
    0x109: function() {
        return new Writer().writeBytes(md5(Buffer.from(this.device.android_id)));
    },
    0x116: function(misc_bitmap, sub_sigmap) {
        return new Writer()
            .writeU8(0)          // ver
            .writeU32(misc_bitmap)
            .writeU32(sub_sigmap)
            .writeU8(1)          // size of app id list
            .writeU32(1600000226)// app id list[0];
    },
    0x124: function() {
        return new Writer()
            .writeTlv(this.device.os_type.slice(0, 16))
            .writeTlv(this.device.version.release.slice(0, 16))
            .writeU16(2)    // network type
            .writeTlv(this.device.sim_info.slice(0, 16))
            .writeTlv(Buffer.alloc(0))  // unknown
            .writeTlv(this.device.apn.slice(0, 16));
    },
    0x128: function() {
        return tlv(
            0x128,
            new Writer()
            .writeU16(0)
            .writeBool(0)
            .writeBool(1)
            .writeBool(0)
            .writeU32(16777216)
            .writeTlv(this.device.model.slice(0, 32))
            .writeTlv(this.device.guid.slice(0, 16))
            .writeTlv(this.device.brand.slice(0, 16))
        );
    },
    0x141: function() {
        return new Writer()
            .writeU16(1)        // ver
            .writeTlv(this.device.sim_info)
            .writeU16(2)        // network type
            .writeTlv(this.device.apn);
    },
    0x142: function() {
        return new Writer()
            .writeU16(0)    // ver
            .writeTlv("com.tencent.mobileqq".slice(0, 32));
    },
    0x144: function(device_info) {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(5);   // tlv cnt
        const body = Buffer.concat([
            buf,
            this[0x109](),
            this[0x52d](device_info),
            this[0x124](),
            this[0x128](),
            this[0x16e](),
        ]);
        return new Writer().writeBytes(tea.encrypt(body, this.device.tgtgt_key));
    },
    0x145: function() {
        return new Writer().writeBytes(this.device.guid);
    },
    0x147: function(appid, apk_version_name, apk_sign_md5) {
        return new Writer()
            .writeU32(this.appid)
            .writeTlv(apk_version_name.slice(0, 32))
            .writeTlv(apk_sign_md5.slice(0, 32));
    },
    0x154: function() {
        return new Writer().writeU32(this.seq_id);
    },
    0x16e: function() {
        return new Writer().writeBytes(this.device.model);
    },
    0x177: function() {
        return new Writer()
            .writeU8(0x01)
            .writeU32(1571193922)   // build time
            .writeTlv("6.0.0.2413");// apk ver
    },
    0x185: function() {
        return new Writer().writeU8(1).writeU8(1);
    },
    0x187: function() {
        return new Writer().writeBytes(md5(Buffer.from(this.device.mac_address)));
    },
    0x188: function() {
        return new Writer().writeBytes(md5(Buffer.from(this.device.android_id)));
    },
    0x191: function() {
        return new Writer().writeU8(0x82);
    },
    0x194: function(buf) {
        return new Writer().writeBytes(buf);
    },
    0x202: function() {
        return new Writer()
            .writeTlv(this.device.wifi_bssid.slice(0, 16))
            .writeTlv(this.device.wifi_ssid.slice(0, 32));
    },
    0x401: function(buf) {
        return new Writer().writeBytes(buf);
    },
    0x511: function() {
        const domains = [
            "tenpay.com", "openmobile.qq.com", "docs.qq.com", "connect.qq.com",
            "qzone.qq.com", "vip.qq.com", "qun.qq.com", "game.qq.com", "qqweb.qq.com",
            "office.qq.com", "ti.qq.com", "mail.qq.com", "qzone.com", "mma.qq.com",
        ];
        const stream = new Writer().writeU16(domains.length);
        for (let v of domains)
            stream.writeU8(0x01).writeTlv(v);
        return stream;
    },
    0x516: function() {
        return new Writer().writeU32(0);   // const
    },
    0x521: function() {
        return new Writer()
            .writeU32(0)    // product type
            .writeU16(0);   // const
    },
    0x525: function(t536) {
        return new Writer()
            .writeU16(1)
            .writeBytes(t536);
    },
    0x52d: function() {
        const d = this.device;
        const buf = pb.encode("DeviceInfo", {
            bootloader: d.bootloader,
            procVersion: d.proc_version,
            codename: d.version.codename,
            incremental: d.version.incremental,
            fingerprint: d.fingerprint,
            bootId: d.boot_id,
            androidId: d.android_id,
            baseBand: d.baseband,
            innerVersion: d.version.incremental,
        });
        return new Writer().writeBytes(buf);
    },
    0x536: function() {
        return new Writer().writeBytes(Buffer.from([0x1, 0x0]));
    }
};

module.exports = function(client) {
    return tlv.bind(client);
};
