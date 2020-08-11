"use strict";
const crypto = require("crypto");
const rand = ()=>parseInt(Math.random()*1e9);
const timestamp = ()=>parseInt(Date.now()/1000);
const now = ()=>Date.now()&0xffffffff;
const md5 = (data)=>crypto.createHash("md5").update(data).digest();
module.exports = {
    rand, now, md5, timestamp
};
