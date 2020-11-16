"use strict";
const pb = require("protobufjs/light");

function isBuffer(buf) {
    return buf instanceof Buffer || buf instanceof Uint8Array;
}

class Nested {
    constructor(bytes, decoded) {
        if (decoded)
            Reflect.setPrototypeOf(this, decoded);
        this.raw = bytes;
    }
}

/**
 * @param {import("protobufjs").Writer} writer 
 */
function _encode(writer, tag, value) {
    if (value === null || value === undefined)
        return;
    let type = 2;
    if (value instanceof Nested)
        value = value.raw;
    if (typeof value === "object" && !isBuffer(value))
        value = encode(value);
    if (typeof value === "bigint") {
        const tmp = new pb.util.Long();
        tmp.unsigned = false;
        tmp.low = parseInt(value & 0xffffffffn);
        tmp.high = parseInt((value & 0xffffffff00000000n) >> 32n);
        value = tmp;
        type = 0;
    }
    if (typeof value === "number") 
        type = Number.isInteger(value) ? 0 : 1;
    const head = parseInt(tag) << 3 | type;
    writer.uint32(head);
    switch (type) {
        case 0:
            if (value < 0)
                writer.sint64(value);
            else
                writer.int64(value);
            break;
        case 1:
            writer.double(value);
            break;
        case 2:
            writer.bytes(isBuffer(value) ? value : Buffer.from(value));
            break;
    }
}

function encode(o) {
    const writer = new pb.Writer();
    for (let tag in o) {
        const value = o[tag];
        if (Array.isArray(value)) {
            for (let v of value)
                _encode(writer, tag, v);
        } else {
            _encode(writer, tag, value);
        }
    }
    return writer.finish();
}

function long2int(long) {
    const bigint = (BigInt(long.high)<<32n)|(BigInt(long.low)&0xffffffffn);
    const int = parseInt(long);
    return Number.isSafeInteger(int) ? int : bigint;
}

function decode(buf) {
    const data = {};
    const reader = new pb.Reader(buf);
    while (reader.pos < reader.len) {
        const k = reader.uint32();
        const tag = k >> 3, type = k & 0b111;
        let value;
        switch (type) {
            case 0:
                value = long2int(reader.int64());
                break;
            case 1:
                value = long2int(reader.fixed64());
                break;
            case 2:
                value = reader.bytes();
                let decoded;
                try {
                    decoded = decode(value);
                } catch {}
                value = new Nested(value, decoded);
                break;
            case 5:
                value = reader.fixed32();
                break;
        }
        if (Array.isArray(data[tag])) {
            data[tag].push(value);
        } else if (Reflect.has(data, tag)) {
            data[tag] = [data[tag]];
            data[tag].push(value);
        } else {
            data[tag] = value;
        }
    }
    return data;
}

/**
 * @param {String} cmd example: OidbSvc.0x568_22
 * @param {Buffer|object} body 
 */
function encodeOIDB(cmd, body) {
    cmd = cmd.replace("OidbSvc.", "").replace("oidb_", "").split("_");
    const type = parseInt(cmd[1]);
    return encode({
        1: parseInt(cmd[0], 16),
        2: isNaN(type) ? 1 : type,
        3: 0,
        4: body,
        6: "android " + this.apk.ver,
    });
}

module.exports = {
    encode, decode,
    encodeOIDB
};
