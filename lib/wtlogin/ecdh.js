"use strict";
const { createECDH } = require("crypto");
const { md5 } = require("../common");

const OICQ_PUBLIC_KEY = Buffer.from("04EBCA94D733E399B2DB96EACDD3F69A8BB0F74224E2B44E3357812211D2E62EFBC91BB553098E25E33A799ADC7F76FEB208DA7C6522CDB0719A305180CC54A82E", "hex");

class Ecdh {
    constructor() {
        const ecdh = createECDH("prime256v1");
        this.public_key = ecdh.generateKeys();
        this.share_key = md5(ecdh.computeSecret(OICQ_PUBLIC_KEY).slice(0, 16));
    }
}

module.exports = Ecdh;
