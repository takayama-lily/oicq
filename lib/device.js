"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const {md5} = require("./packet/common");

function rand(n) {
    const max = 10**n - n;
    const min = 10**(n-1) + n;
    return parseInt(Math.random()*(max-min)+min);
}

function genDevice(filepath) {
    const id = `IARIM.${rand(6)}.${rand(3)}`;
    const incremental = rand(7);
    const imei = rand(15);
    const device_info = `{
    "product":      "iarim",
    "device":       "sagit",
    "board":        "eomam",
    "brand":        "Xiaomi",
    "model":        "MI 6",
    "wifi_ssid":    "TP-LINK-${rand(10).toString(16)}",
    "bootloader":   "U-boot",
    "--boundary--": "上面的可以根据喜好修改，下面的请勿随意更改，除非你知道你在做什么",
    "id":           "${id}",
    "boot_id":      "34030ae3-6e82-472e-b5c1-a43f2aaa8827",
    "proc_version": "Linux version 3.0.31-34030ae3 (android-build@xxx.xxx.xxx.xxx.com)",
    "mac_address":  "00:50:56:C0:00:08",
    "imei":         "${imei}",
    "incremental":  "${incremental}"
    
}`;
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, {recursive: true, mode: 0o755});
    fs.writeFileSync(filepath, device_info);
    return JSON.parse(device_info);
}

module.exports = function getDeviceInfo(filepath) {
    var device;
    if (fs.existsSync(filepath)) {
        device = JSON.parse(fs.readFileSync(filepath));
    } else {
        device = genDevice(filepath)
    }
    const device_info = {
        "display":      device.id,
        "product":      device.product,
        "device":       device.device,
        "board":        device.board,
        "brand":        device.brand,
        "model":        device.model,
        "bootloader":   device.bootloader,
        "fingerprint":  `${device.brand}/${device.product}/${device.device}:10/${device.id}/${device.incremental}:user/release-keys`,
        "boot_id":      device.boot_id,
        "proc_version": device.proc_version,
        "base_band":    "",
        "sim_info":     "T-Mobile",
        "os_type":      "android",
        "mac_address":  device.mac_address,
        "ip_address":   "10.0.1.3",
        "wifi_bssid":   device.mac_address,
        "wifi_ssid":    device.wifi_ssid,
        "imei":         device.imei,
        "android_id":   device.id,
        "apn":          "wifi",
        "version": {
            "incremental": device.incremental,
            "release":     "10",
            "codename":    "REL",
            "sdk":         29
        }
    }

    device_info.imsi_md5 = md5(rand().toString());
    device_info.tgtgt_key = md5(rand().toString());
    device_info.guid = md5(Buffer.concat([Buffer.from(device_info.android_id), Buffer.from(device_info.mac_address)]));
    return device_info;
};
