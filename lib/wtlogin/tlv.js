"use strict";
const crypto = require("crypto");
const tea = require("../tea");
const Writer = require("./writer");
const { md5 } = require("../common");
const pb = require("../pb");

/**
 * @this {import("../ref").Client} 
 * @param {number} tag 
 * @returns {Buffer}
 */
function packTlv(tag, ...args) {
    /**
     * @type {Writer}
     */
    const stream = tlv_map[tag].apply(this, args);
    const len = Buffer.allocUnsafe(2);
    len.writeUInt16BE(stream.readableLength);
    stream.unshift(len);
    const tag_buf = Buffer.allocUnsafe(2);
    tag_buf.writeUInt16BE(tag);
    stream.unshift(tag_buf);
    return stream.read();
}

/**
 * @type {({[k: number]: (this: import("../ref").Client, ...args: any[]) => Writer})}
 */
const tlv_map = {
    0x01: function () {
        return new Writer()
            .writeU16(1) // ip ver
            .writeBytes(crypto.randomBytes(4))
            .writeU32(this.uin)
            .write32(Date.now() & 0xffffffff)
            .writeBytes(Buffer.alloc(4)) //ip
            .writeU16(0);
    },
    0x02: function (captcha) {
        return new Writer()
            .writeU16(0) // sign ver
            .writeTlv(captcha)
            .writeTlv(this.captcha_sign);
    },
    0x08: function () {
        return new Writer()
            .writeU16(0)
            .writeU32(2052)
            .writeU16(0);
    },
    0x18: function () {
        return new Writer()
            .writeU16(1) // ping ver
            .writeU32(1536)
            .writeU32(this.apk.appid)
            .writeU32(0) // app client ver
            .writeU32(this.uin)
            .writeU16(0)
            .writeU16(0);
    },
    0x100: function (emp = 0) {
        return new Writer()
            .writeU16(1) // db buf ver
            .writeU32(7) // sso ver, dont over 7
            .writeU32(this.apk.appid)
            .writeU32(emp ? 2 : this.apk.subid)
            .writeU32(0) // app client ver
            .writeU32(this.apk.sigmap);
    },
    0x104: function () {
        return new Writer().writeBytes(this.t104);
    },
    0x106: function () {
        const body = new Writer()
            .writeU16(4) // tgtgt ver
            .writeBytes(crypto.randomBytes(4))
            .writeU32(7) // sso ver
            .writeU32(this.apk.appid)
            .writeU32(0) // app client ver
            .writeU64(this.uin)
            .write32(Date.now() & 0xffffffff)
            .writeBytes(Buffer.alloc(4)) // dummy ip
            .writeU8(1) // save password
            .writeBytes(this.password_md5)
            .writeBytes(this.device.tgtgt)
            .writeU32(0)
            .writeU8(1) // guid available
            .writeBytes(this.device.guid)
            .writeU32(this.apk.subid)
            .writeU32(1) // login type password
            .writeTlv(String(this.uin))
            .writeU16(0)
            .read();
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(this.uin);
        const key = md5(Buffer.concat([
            this.password_md5, Buffer.alloc(4), buf
        ]));
        return new Writer().writeBytes(tea.encrypt(body, key));
    },
    0x107: function () {
        return new Writer()
            .writeU16(0)    // pic type
            .writeU8(0)     // captcha type
            .writeU16(0)    // pic size
            .writeU8(1);    // ret type
    },
    0x108: function () {
        return new Writer().writeBytes(this.ksid);
    },
    0x109: function () {
        return new Writer().writeBytes(md5(this.device.imei));
    },
    0x10a: function () {
        return new Writer().writeBytes(this.sig.tgt);
    },
    0x116: function () {
        return new Writer()
            .writeU8(0)
            .writeU32(this.apk.bitmap)
            .writeU32(0x10400) // sub sigmap
            .writeU8(1) // size of app id list
            .writeU32(1600000226); // app id list[0]
    },
    0x124: function () {
        return new Writer()
            .writeTlv(this.device.os_type.slice(0, 16))
            .writeTlv(this.device.version.release.slice(0, 16))
            .writeU16(2) // network type
            .writeTlv(this.device.sim.slice(0, 16))
            .writeU16(0)
            .writeTlv(this.device.apn.slice(0, 16));
    },
    0x128: function () {
        return new Writer()
            .writeU16(0)
            .writeU8(0) // guid new
            .writeU8(1) // guid available
            .writeU8(0) // guid changed
            .writeU32(16777216) // guid flag
            .writeTlv(this.device.model.slice(0, 32))
            .writeTlv(this.device.guid.slice(0, 16))
            .writeTlv(this.device.brand.slice(0, 16));
    },
    0x141: function () {
        return new Writer()
            .writeU16(1) // ver
            .writeTlv(this.device.sim)
            .writeU16(2) // network type
            .writeTlv(this.device.apn);
    },
    0x142: function () {
        return new Writer()
            .writeU16(0)
            .writeTlv(this.apk.id.slice(0, 32));
    },
    0x143: function (d2) {
        return new Writer().writeBytes(d2);
    },
    0x144: function () {
        const body = new Writer()
            .writeU16(5) // tlv cnt
            .writeBytes(packTlv.call(this, 0x109))
            .writeBytes(packTlv.call(this, 0x52d))
            .writeBytes(packTlv.call(this, 0x124))
            .writeBytes(packTlv.call(this, 0x128))
            .writeBytes(packTlv.call(this, 0x16e));
        return new Writer().writeBytes(tea.encrypt(body.read(), this.device.tgtgt));
    },
    0x145: function () {
        return new Writer().writeBytes(this.device.guid);
    },
    0x147: function () {
        return new Writer()
            .writeU32(this.apk.appid)
            .writeTlv(this.apk.ver.slice(0, 5))
            .writeTlv(this.apk.sign);
    },
    0x154: function () {
        return new Writer().writeU32(this.seq_id);
    },
    0x16a: function () {
        return new Writer().writeBytes(this.sig.srm_token);
    },
    0x16e: function () {
        return new Writer().writeBytes(this.device.model);
    },
    0x174: function () {
        return new Writer().writeBytes(this.t174);
    },
    0x177: function () {
        return new Writer()
            .writeU8(0x01)
            .writeU32(this.apk.buildtime)
            .writeTlv(this.apk.sdkver);
    },
    0x17a: function () {
        return new Writer().writeU32(9);
    },
    0x17c: function (code) {
        return new Writer().writeTlv(code);
    },
    0x187: function () {
        return new Writer().writeBytes(md5(this.device.mac_address));
    },
    0x188: function () {
        return new Writer().writeBytes(md5(this.device.android_id));
    },
    0x191: function () {
        return new Writer().writeU8(0x82);
    },
    0x193: function (ticket) {
        return new Writer().writeBytes(ticket);
    },
    0x194: function () {
        return new Writer().writeBytes(this.device.imsi);
    },
    0x197: function () {
        return new Writer().writeTlv(Buffer.alloc(1));
    },
    0x198: function () {
        return new Writer().writeTlv(Buffer.alloc(1));
    },
    0x202: function () {
        return new Writer()
            .writeTlv(this.device.wifi_bssid.slice(0, 16))
            .writeTlv(this.device.wifi_ssid.slice(0, 32));
    },
    0x401: function () {
        return new Writer().writeBytes(crypto.randomBytes(16));
    },
    0x511: function () {
        const domains = [
            "tenpay.com", "openmobile.qq.com", "docs.qq.com", "connect.qq.com",
            "qzone.qq.com", "vip.qq.com", "qun.qq.com", "game.qq.com", "qqweb.qq.com",
            "office.qq.com", "ti.qq.com", "mail.qq.com", "gamecenter.qq.com", "mma.qq.com",
        ];
        const stream = new Writer().writeU16(domains.length);
        for (let v of domains)
            stream.writeU8(0x01).writeTlv(v);
        return stream;
    },
    0x516: function () {
        return new Writer().writeU32(0);
    },
    0x521: function () {
        return new Writer()
            .writeU32(0)    // product type
            .writeU16(0);   // const
    },
    0x525: function () {
        return new Writer()
            .writeU16(1) // tlv cnt
            .writeU16(0x536) // tag
            .writeTlv(Buffer.from([0x1, 0x0])); // zero
    },
    0x52d: function () {
        const d = this.device;
        const buf = pb.encode({
            1: d.bootloader,
            2: d.proc_version,
            3: d.version.codename,
            4: d.version.incremental,
            5: d.fingerprint,
            6: d.boot_id,
            7: d.android_id,
            8: d.baseband,
            9: d.version.incremental,
        });
        return new Writer().writeBytes(buf);
    },
};

/**
 * @param {import("../ref").Client} client 
 * @returns {(this: import("../ref").Client, tag: number, ...args: any[]) => Buffer}
 */
module.exports.getPacker = function (client) {
    return packTlv.bind(client);
};
