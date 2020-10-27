"use strict";
const PassThrough = require("stream").PassThrough;

/**
 * @link https://nodejs.org/dist/latest/docs/api/stream.html#stream_class_stream_passthrough
 */
class Writer extends PassThrough {

    /**
     * @param {Number} v 0x0~0xff
     * @returns {this}
     */
    writeU8(v) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(v);
        this.write(buf);
        return this;
    }

    /**
     * @param {Number} v 0x0~0xffff
     * @returns {this}
     */
    writeU16(v) {
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt16BE(v);
        this.write(buf);
        return this;
    }

    /**
     * @param {Number} v
     * @returns {this}
     */
    write32(v) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeInt32BE(v);
        this.write(buf);
        return this;
    }

    /**
     * @param {Number} v 0x0~0xffffffff
     * @returns {this}
     */
    writeU32(v) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeUInt32BE(v);
        this.write(buf);
        return this;
    }

    /**
     * @param {Number} v 0x0~0xffffffffffffffff JS有精度问题，大于52位的整数传BigInt
     * @returns {this}
     */
    writeU64(v) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeBigUInt64BE(BigInt(v));
        this.write(buf);
        return this;
    }

    /**
     * @param {String|Buffer} v 写入原始数据
     * @returns {this}
     */
    writeBytes(v) {
        if (typeof v === "string")
            v = Buffer.from(v);
        this.write(v);
        return this;
    }

    /**
     * @param {String|Buffer} v 前面会追加一个UInt32保存v的长度+4
     * @returns {this}
     */
    writeWithLength(v) {
        return this.writeU32(Buffer.byteLength(v) + 4).writeBytes(v);
    }

    /**
     * @param {String|Buffer} v 前面会追加一个UInt16保存v的长度
     * @returns {this}
     */
    writeTlv(v) {
        return this.writeU16(Buffer.byteLength(v)).writeBytes(v);
    }
}
module.exports = Writer;
