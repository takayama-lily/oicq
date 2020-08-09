"use strict"
const PassThrough = require("stream").PassThrough
class Writer extends PassThrough {
    writeBool(v = false) {
        return this.writeU8(v ? 0x01 : 0x00)
    }
    writeU8(v = 0x00) {
        const buf = Buffer.alloc(1)
        buf.writeUInt8(v)
        this.write(buf)
        return this
    }
    writeU16(v = 0x0000) {
        const buf = Buffer.alloc(2)
        buf.writeUInt16BE(v)
        this.write(buf)
        return this
    }
    writeU32(v = 0x00000000) {
        const buf = Buffer.alloc(4)
        buf.writeUInt32BE(v)
        this.write(buf)
        return this
    }
    writeU64(v = 0x0000000000000000) {
        const buf = Buffer.alloc(8)
        buf.writeBigUInt64BE(BigInt(v))
        this.write(buf)
        return this
    }
    writeStr(v = "") {
        this.writeU32(Buffer.byteLength(v)).write(v)
        return this
    }
    writeBytes(v) {
        this.write(v)
        return this
    }
}
module.exports = Writer
