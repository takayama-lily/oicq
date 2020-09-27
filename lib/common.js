"use strict";
const crypto = require("crypto");
const util = require("util");

function rand(n = 9) {
    const max = 10**n - n;
    const min = 10**(n-1) + n;
    return parseInt(Math.random()*(max-min)+min);
}
function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c)=>{
        const r = Math.random()*16|0, v = c === "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}
const timestamp = ()=>parseInt(Date.now()/1000);
const now = ()=>parseInt(BigInt(Date.now())&0xffffffffn);
const md5 = (data)=>crypto.createHash("md5").update(data).digest();

function emit(o, name, data = {}) {
    const slice = name.split(".");
    const post_type = slice[0], sub_type = slice[2];
    const param = {
        self_id:    o.uin,
        time:       parseInt(Date.now()/1000),
        post_type:  post_type
    };
    const type_name = slice[0] + "_type";
    param[type_name] = slice[1];
    if (sub_type)
        param.sub_type = sub_type;
    Object.assign(param, data);
    const lv2_event = post_type + "." + slice[1];
    if (o.listenerCount(name))
        o.emit(name, param);
    else if (o.listenerCount(lv2_event))
        o.emit(lv2_event, param);
    else
        o.emit(post_type, param);
}

function toInt(long) {
    if (typeof long === "string")
        long = parseInt(long);
    if (typeof long === "number")
        return isNaN(long) ? 0 : long;
    if (typeof long === "bigint")
        return parseInt(long);
    if (long !== null && long !== undefined && typeof long.high === "number" && typeof long.low === "number")
        return parseInt((BigInt(long.high)<<32n)|(BigInt(long.low)&0xffffffffn));
    return 0;
}

/**
 * @param {Number} uin 
 * @returns {Boolean}
 */
function checkUin(uin) {
    return uin >= 10000 && uin <= 0xffffffff;
}

function code2uin(groupCode) {
    let left = parseInt(groupCode / 1000000);
    if (left >= 0 && left <= 10)
        left += 202;
    else if (left >= 11 && left <= 19)
        left += 469;
    else if (left >= 20 && left <= 66)
        left += 2080;
    else if (left >= 67 && left <= 156)
        left += 1943;
    else if (left >= 157 && left <= 209)
        left += 1990;
    else if (left >= 310 && left <= 499)
        left += 3490;
    else if (left >= 210 && left <= 309)
        left += 3890;
    return left * 1000000 + groupCode % 1000000;
}
function uin2code(groupUin) {
    let left = parseInt(groupUin / 1000000);
    if (left >= 202 && left <= 212)
        left -= 202;
    else if (left >= 480 && left <= 488)
        left -= 469;
    else if (left >= 2100 && left <= 2146)
        left -= 2080;
    else if (left >= 2010 && left <= 2099)
        left -= 1943;
    else if (left >= 2147 && left <= 2199)
        left -= 1990;
    else if (left >= 3800 && left <= 3989)
        left -= 3490;
    else if (left >= 4100 && left <= 4199)
        left -= 3890;
    return left * 1000000 + groupUin % 1000000;
}

function log(any) {
    console.log(util.inspect(any, {depth: 20, showHidden: false, maxArrayLength: 1000, maxStringLength: 5000}));
}

module.exports = {
    rand, uuid, now, md5, timestamp, toInt, checkUin,
    log, code2uin, uin2code, emit
};
