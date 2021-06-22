/**
 * 密码登录流程
 * 
 * token -> ok(二次)               ok(设备安全,已验证的设备或在常用地自动通过)
 * token not exists ↘          ↗
 *                     password -> slider -> password (url verify) -> ok(假设备锁)
 * token (expired)  ↗          (可能跳过) ↘         ->           |-> device -> ok(真设备锁)
 *                                           sendSMS ->  smsLogin  -> ok(假设备锁)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const { WtLogin } = require("./wt");
const Writer = require("./writer");
const { md5 } = require("../common");

WtLogin.prototype.passwordLogin = async function () {
    this.session_id = randomBytes(4);
    this.random_key = randomBytes(16);
    try {
        this.t106 = await fs.promises.readFile(path.join(this.dir, "t106"));
        const token = await fs.promises.readFile(path.join(this.dir, "token"));
        const d2key = token.slice(0, 16);
        const d2 = token.slice(16, 80);
        const ticket = token.slice(80, 96);
        const sig = token.slice(96, 144);
        const srm = token.slice(144, 200);
        const tgt = token.slice(200, 272);
        this.sig.device_token = token.slice(272);
        if (d2key.length && d2.length && ticket.length && sig.length && srm.length && tgt.length) {
            this.sig.ticket_key = ticket;
            this.sig.sig_key = sig;
            this.sig.srm_token = srm;
            this.sig.tgt = tgt;
            this.device.tgtgt = md5(d2key);
            this.token_flag = true;
            return this.tokenLogin(d2);
        }
    } catch {
        this.token_flag = false;
    }
    if (!this.password_md5)
        return this.fetchQrcode();
    const t = this.tlvPacker;
    let body = new Writer()
        .writeU16(9)
        .writeU16(24)
        .writeBytes(t(0x18))
        .writeBytes(t(0x1))
        .writeBytes(t(0x106))
        .writeBytes(t(0x116))
        .writeBytes(t(0x100))
        .writeBytes(t(0x107))
        .writeBytes(t(0x108))
        .writeBytes(t(0x142))
        .writeBytes(t(0x144))
        .writeBytes(t(0x145))
        .writeBytes(t(0x147))
        .writeBytes(t(0x154))
        .writeBytes(t(0x141))
        .writeBytes(t(0x8))
        .writeBytes(t(0x511))
        .writeBytes(t(0x187))
        .writeBytes(t(0x188))
        .writeBytes(t(0x194))
        .writeBytes(t(0x191))
        .writeBytes(t(0x202))
        .writeBytes(t(0x177))
        .writeBytes(t(0x516))
        .writeBytes(t(0x521))
        .writeBytes(t(0x525))
        .read();
    this.sendLogin("wtlogin.login", body);
}

WtLogin.prototype.sliderLogin = function (ticket) {
    if (!this.t104)
        return this.logger.warn("未收到滑动验证码或已过期，你不能调用sliderLogin函数。");
    ticket = String(ticket).trim();
    const t = this.tlvPacker;
    const body = new Writer()
        .writeU16(2)
        .writeU16(4)
        .writeBytes(t(0x193, ticket))
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .read();
    this.sendLogin("wtlogin.login", body);
}

WtLogin.prototype.deviceLogin = function () {
    const t = this.tlvPacker;
    const body = new Writer()
        .writeU16(20)
        .writeU16(4)
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .writeBytes(t(0x401))
        .read();
    this.sendLogin("wtlogin.login", body);
}

WtLogin.prototype.sendSMSCode = function () {
    if (!this.t104 || !this.t174)
        return this.logger.warn("未收到设备锁验证要求，你不能调用sendSMSCode函数。");
    const t = this.tlvPacker;
    const body = new Writer()
        .writeU16(8)
        .writeU16(6)
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .writeBytes(t(0x174))
        .writeBytes(t(0x17a))
        .writeBytes(t(0x197))
        .read();
    this.logger.mark(`已向手机 ${this.phone} 发送短信验证码，请查看并输入。`);
    this.sendLogin("wtlogin.login", body);
}

WtLogin.prototype.submitSMSCode = function (code) {
    if (!this.t104 || !this.t174)
        return this.logger.warn("未发送短信验证码，你不能调用submitSMSCode函数。");
    code = String(code).trim();
    if (Buffer.byteLength(code) !== 6)
        code = "123456";
    const t = this.tlvPacker;
    const body = new Writer()
        .writeU16(7)
        .writeU16(7)
        .writeBytes(t(0x8))
        .writeBytes(t(0x104))
        .writeBytes(t(0x116))
        .writeBytes(t(0x174))
        .writeBytes(t(0x17c, code))
        .writeBytes(t(0x401))
        .writeBytes(t(0x198))
        .read();
    this.sendLogin("wtlogin.login", body);
}

WtLogin.prototype.tokenLogin = function (d2) {
    const t = this.tlvPacker;
    const body = new Writer()
        .writeU16(11)
        .writeU16(16)
        .writeBytes(t(0x100))
        .writeBytes(t(0x10a))
        .writeBytes(t(0x116))
        .writeBytes(t(0x144))
        .writeBytes(t(0x143, d2))
        .writeBytes(t(0x142))
        .writeBytes(t(0x154))
        .writeBytes(t(0x18))
        .writeBytes(t(0x141))
        .writeBytes(t(0x8))
        .writeBytes(t(0x147))
        .writeBytes(t(0x177))
        .writeBytes(t(0x187))
        .writeBytes(t(0x188))
        .writeBytes(t(0x202))
        .writeBytes(t(0x511))
        .read();
    this.sendLogin("wtlogin.exchange_emp", body);
}
