"use strict";
const pb = require("protobufjs/light");

function isBuffer(buf) {
    return buf instanceof Buffer || buf instanceof Uint8Array || buf instanceof ArrayBuffer || buf instanceof SharedArrayBuffer;
}

/**
 * @param {import("protobufjs").Writer} writer 
 */
function _encode(writer, tag, value) {
    if (value === null || value === undefined)
        return;
    let type = 2;
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
                // try {
                //     value = decode(value);
                // } catch {}
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

function encodeOIDB(cmd, type, body) {
    return encode({
        1: cmd,
        2: type,
        3: 0,
        4: body,
    });
}

module.exports = {
    encode, decode,
    encodeOIDB
}

// var c = encode({
//     1: 0,
//     2: {
//         1: 0, 2: 33
//     },
//     3: 0xffffffffffffffffn/2n**16n,
//     4: "あいうえお",
//     6: Buffer.allocUnsafe(11),
//     9: [
//         {
//             1: 2
//         },
//         {
//             1: 3
//         }
//     ]
// })
// console.log(c)
// console.log(decode(c))
