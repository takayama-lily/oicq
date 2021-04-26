/**
 * 设备文件和协议
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { md5 } = require("./common");

/**
 * @param {number} uin 
 */
function _genIMEI(uin) {
    let imei = uin % 2 ? "86" : "35";
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(uin);
    let a = buf.readUInt16BE();
    let b = Buffer.concat([Buffer.alloc(1), buf.slice(1)]).readUInt32BE();
    if (a > 9999) {
        a = parseInt(a / 10);
    } else if (a < 1000) {
        a = String(uin).substr(0, 4);
    }
    while (b > 9999999) {
        b = b >>> 1;
    }
    if (b < 1000000) {
        b = String(uin).substr(0, 4) + String(uin).substr(0, 3);
    }
    imei += a + "0" + b;
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

/**
 * @param {string} filepath 
 * @param {number} uin 
 */
function _genDevice(filepath, uin) {
    const hash = md5(String(uin));
    const hex = hash.toString("hex");
    const uuid = hex.substr(0, 8) + "-" + hex.substr(8, 4) + "-" + hex.substr(12, 4) + "-" + hex.substr(16, 4) + "-" + hex.substr(20);
    const device = `{
    "--begin--":    "该设备文件由账号作为seed自动生成，每个账号生成的文件相同。",
    "product":      "MRS4S",
    "device":       "HIM188MOE",
    "board":        "MIRAI-YYDS",
    "brand":        "OICQX",
    "model":        "Konata 2020",
    "wifi_ssid":    "TP-LINK-${uin.toString(16)}",
    "bootloader":   "U-boot",
    "android_id":   "OICQX.${hash.readUInt16BE()}${hash[2]}.${hash[3]}${String(uin)[0]}",
    "boot_id":      "${uuid}",
    "proc_version": "Linux version 4.19.71-${hash.readUInt16BE(4)} (konata@takayama.github.com)",
    "mac_address":  "00:50:${hash[6].toString(16).toUpperCase()}:${hash[7].toString(16).toUpperCase()}:${hash[8].toString(16).toUpperCase()}:${hash[9].toString(16).toUpperCase()}",
    "ip_address":   "10.0.${hash[10]}.${hash[11]}",
    "imei":         "${_genIMEI(uin)}",
    "incremental":  "${hash.readUInt32BE(12)}",
    "--end--":      "修改后可能需要重新验证设备。"
}`;
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    fs.writeFileSync(filepath, device, { mode: 0o600 });
    return JSON.parse(device);
}

/**
 * @param {string} filepath 
 * @param {number} uin 
 * @returns {import("./lib/ref").Device}
 */
function getDeviceInfo(filepath, uin) {
    var d;
    try {
        d = JSON.parse(fs.readFileSync(filepath, { encoding: "utf-8" }));
    } catch {
        d = _genDevice(filepath, uin);
    }
    const device = {
        display: d.android_id,
        product: d.product,
        device: d.device,
        board: d.board,
        brand: d.brand,
        model: d.model,
        bootloader: d.bootloader,
        fingerprint: `${d.brand}/${d.product}/${d.device}:10/${d.android_id}/${d.incremental}:user/release-keys`,
        boot_id: d.boot_id,
        proc_version: d.proc_version,
        baseband: "",
        sim: "T-Mobile",
        os_type: "android",
        mac_address: d.mac_address,
        ip_address: d.ip_address,
        wifi_bssid: d.mac_address,
        wifi_ssid: d.wifi_ssid,
        imei: d.imei,
        android_id: d.android_id,
        apn: "wifi",
        version: {
            incremental: d.incremental,
            release: "10",
            codename: "REL",
            sdk: 29
        }
    };
    device.imsi = crypto.randomBytes(16);
    device.tgtgt = crypto.randomBytes(16);
    device.guid = md5(Buffer.concat([Buffer.from(device.imei), Buffer.from(device.mac_address)]));
    return device;
}

/**
 * @type {{[k: number]: import("./lib/ref").ApkInfo}}
 */
const apk = {
    //android phone
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

    //apad
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
};

//android watch
apk[3] = { ...apk[1] };
apk[3].subid = 537061176;

//mac (experimental)
apk[4] = { ...apk[2] };
apk[4].subid = 537064315;

//ipad (experimental)
apk[5] = { ...apk[2] };
apk[5].subid = 537065739;

/**
 * @param {number} platform 
 */
function getApkInfo(platform) {
    return apk[platform] ? apk[platform] : apk[1];
}

module.exports = {
    getDeviceInfo, getApkInfo
};
