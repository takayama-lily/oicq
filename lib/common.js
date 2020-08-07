"use strict"
const crypto = require("crypto")
const rand = ()=>(Math.random()*1e9).toFixed()
const now = ()=>(Date.now()/1000).toFixed()
const md5 = (data)=>crypto.createHash("md5").update(data).digest()
module.exports = {
    rand, now, md5
}
