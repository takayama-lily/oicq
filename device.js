"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {uuid, md5} = require("./lib/common");

function rand(n = 9) {
    const max = 10**n - n;
    const min = 10**(n-1) + n;
    return parseInt(Math.random()*(max-min)+min);
}

function getMac() {
    const o = os.networkInterfaces();
    for (let k in o) {
        for (let v of o[k]) {
            if (!v.internal)
                return v.mac.toUpperCase();
        }
    }
    return `00:50:A${rand(1)}:${rand(1)}D:${rand(1)}B:C${rand(1)}`;
}

function genIMEI() {
    let imei = Math.random() > 0.5 ? "86" : "35";
    imei += rand(4) + "0" + rand(7);
    function calcSP(imei) {
        let sum = 0;
        for (let i = 0; i < imei.length; ++i) {
            if (i % 2) {
                let j = imei[i] * 2;
                sum += j % 10 + Math.floor(j / 10);
            } else {
                sum += parseInt(imei[i]);
            }
        }
        return (100 - sum) % 10;
    }
    return imei + calcSP(imei);
}

function genDevice(filepath) {
    const device = `{
    "--begin--":    "修改后可能需要重新验证设备。",
    "product":      "iarim",
    "device":       "sagit",
    "board":        "eomam",
    "brand":        "Xiaomi",
    "model":        "MI ${rand(1)}",
    "wifi_ssid":    "TP-LINK-${rand(10).toString(16)}",
    "bootloader":   "U-boot",
    "--end--":      "下面的请勿随意修改，除非你知道你在做什么。",
    "android_id":   "BRAND.${rand(6)}.${rand(3)}",
    "boot_id":      "${uuid()}",
    "proc_version": "Linux version 4.19.71-${rand(5)} (oicq@takayama.github.com)",
    "mac_address":  "${getMac()}",
    "ip_address":   "10.0.${rand(2)}.${rand(2)}",
    "imei":         "${genIMEI()}",
    "incremental":  "${rand(7)}"
}`;
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, {recursive: true, mode: 0o755});
    fs.writeFileSync(filepath, device);
    return JSON.parse(device);
}

/**
 * @param {String} filepath 
 * @returns {import("./lib/ref").Device}
 */
function getDeviceInfo(filepath) {
    var d;
    if (fs.existsSync(filepath)) {
        d = JSON.parse(fs.readFileSync(filepath));
    } else {
        d = genDevice(filepath);
    }
    const device = {
        display:      d.android_id,
        product:      d.product,
        device:       d.device,
        board:        d.board,
        brand:        d.brand,
        model:        d.model,
        bootloader:   d.bootloader,
        fingerprint:  `${d.brand}/${d.product}/${d.device}:10/${d.android_id}/${d.incremental}:user/release-keys`,
        boot_id:      d.boot_id,
        proc_version: d.proc_version,
        baseband:     "",
        sim:          "T-Mobile",
        os_type:      "android",
        mac_address:  d.mac_address,
        ip_address:   d.ip_address,
        wifi_bssid:   d.mac_address,
        wifi_ssid:    d.wifi_ssid,
        imei:         d.imei,
        android_id:   d.android_id,
        apn:          "wifi",
        version: {
            incremental: d.incremental,
            release:     "10",
            codename:    "REL",
            sdk:         29
        }
    };
    device.imsi = crypto.randomBytes(16);
    device.tgtgt = crypto.randomBytes(16);
    device.guid = md5(Buffer.concat([Buffer.from(device.imei), Buffer.from(device.mac_address)]));
    return device;
};

const apk = {
    1: {
        id: "com.tencent.mobileqq",
        name: "A8.4.1.2703aac4",
        version: "8.4.1.2703",
        ver: "8.4.1",
        sign: Buffer.from([166, 183, 69, 191, 36, 162, 194, 119, 82, 119, 22, 246, 243, 110, 182, 141]),
        buildtime: 1591690260,
        appid: 16,
        subid: 537064989,
        bitmap: 184024956,
        sigmap: 34869472,
        sdkver: "6.0.0.2428",
    },
    2: {
        id: "com.tencent.minihd.qq",
        name: "A5.8.9.3460",
        version: "5.8.9.3460",
        ver: "5.8.9",
        sign: Buffer.from([170, 57, 120, 244, 31, 217, 111, 249, 145, 74, 102, 158, 24, 100, 116, 199]),
        buildtime: 1595836208,
        appid: 16,
        subid: 537065549,
        bitmap: 150470524,
        sigmap: 1970400,
        sdkver: "6.0.0.2433",
    }
}

/**
 * @param {Number} platform 
 * @returns {import("./lib/ref").ApkInfo}
 */
function getApkInfo(platform) {
    return apk[platform] ? apk[platform] : apk[2];
}

module.exports = {
    getDeviceInfo, getApkInfo
}
