"use strict";
const crypto = require("crypto");
const { md5 } = require("../common");

const OICQ_PUBLIC_KEY = Buffer.from("04EBCA94D733E399B2DB96EACDD3F69A8BB0F74224E2B44E3357812211D2E62EFBC91BB553098E25E33A799ADC7F76FEB208DA7C6522CDB0719A305180CC54A82E", "hex");

/**
 * @link https://www.bookstack.cn/read/nodejs-api-doc-cn/crypto-class_ECDH.md
 */
const self = crypto.createECDH("prime256v1");
const public_key = self.generateKeys();
// const private_key = self.getPrivateKey();
const share_key = md5(self.computeSecret(OICQ_PUBLIC_KEY).slice(0, 16));

module.exports = {
    public_key, share_key
};
