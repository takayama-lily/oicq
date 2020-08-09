"use strict"
const Readable = require("stream").Readable
const tea = require('crypto-tea')

const ParseIncomingPacket = (data, key)=>{
    const stream = Readable.from(data, {objectMode:false})
    const flag1 = stream.read(4)
    if (flag1 !== 0x0A && flag1 !== 0x0B)
        throw new Error("decrypt failed")
    const flag2 = stream.read(1)
    const flag3 = stream.read(1)
    if (flag3 !== 0)
        throw new Error("unknown flag")
    let decrypted = stream.read(stream.read(2))
    switch (flag2) {
        case 1:
            decrypted = tea.decrypt(decrypted, key)
            break
        case 2:
            decrypted = tea.decrypt(decrypted, Buffer.alloc(16))
            break
        default:
            break
    }
    if (decrypted.length === 0)
        throw new Error("decrypt failed")
    return parseSsoFrame(decrypted, flag2)
}
