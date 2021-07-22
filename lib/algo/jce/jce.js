"use strict";
const Readable = require("stream").Readable;
class JceError extends Error { }
const BUF0 = Buffer.alloc(0);

/**
 * @typedef {{[k: string]: number}} JceStruct jce data struct
 */

const TYPE_INT8 = 0;
const TYPE_INT16 = 1;
const TYPE_INT32 = 2;
const TYPE_INT64 = 3;
const TYPE_FLOAT = 4;
const TYPE_DOUBLE = 5;
const TYPE_STRING1 = 6;
const TYPE_STRING4 = 7;
const TYPE_MAP = 8;
const TYPE_LIST = 9;
const TYPE_STRUCT_BEGIN = 10;
const TYPE_STRUCT_END = 11;
const TYPE_ZERO = 12;
const TYPE_SIMPLE_LIST = 13;

const TAG_MAP_K = 0;
const TAG_MAP_V = 1;
const TAG_LIST_E = 0;
const TAG_BYTES = 0;
const TAG_LENGTH = 0;
const TAG_STRUCT_END = 0;

const FLAG_STRUCT_END = Symbol("FLAG_STRUCT_END");

let _encoding = "utf8";

class Struct extends null { }

/**
 * @param {Readable} stream 
 */
function readHead(stream) {
    const head = stream.read(1).readUInt8();
    const type = head & 0xf;
    let tag = (head & 0xf0) >> 4;
    if (tag === 0xf) {
        tag = stream.read(1).readUInt8();
    }
    return {tag, type};
}

/**
 * @param {Readable} stream 
 * @param {number} type UInt8 0~13
 */
function readBody(stream, type) {
    let len;
    switch(type) {
    case TYPE_ZERO:
        return 0;
    case TYPE_INT8:
        return stream.read(1).readInt8();
    case TYPE_INT16:
        return stream.read(2).readInt16BE();
    case TYPE_INT32:
        return stream.read(4).readInt32BE();
    case TYPE_INT64:
        let value = stream.read(8).readBigInt64BE();
        if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER)
            value = Number(value);
        return value;
    case TYPE_STRING1:
        len = stream.read(1).readUInt8();
        return len > 0 ? stream.read(len).toString(_encoding) : "";
    case TYPE_STRING4:
        len = stream.read(4).readUInt32BE();
        return len > 0 ? stream.read(len).toString(_encoding) : "";
    case TYPE_SIMPLE_LIST:
        readHead(stream);
        len = readElement(stream).value;
        return len > 0 ? stream.read(len) : BUF0;
    case TYPE_LIST:
        len = readElement(stream).value;
        const list = [];
        while(len > 0) {
            list.push(readElement(stream).value);
            --len;
        }
        return list;
    case TYPE_MAP:
        len = readElement(stream).value;
        const map = Object.create(null);
        while(len > 0) {
            map[readElement(stream).value] = readElement(stream).value;
            --len;
        }
        return map;
    case TYPE_STRUCT_BEGIN:
        return readStruct(stream);
    case TYPE_STRUCT_END:
        return FLAG_STRUCT_END;
    case TYPE_FLOAT:
        return stream.read(4).readFloatBE();
    case TYPE_DOUBLE:
        return stream.read(8).readDoubleBE();
    default:
        throw new JceError("unknown jce type: " + type);
    }
}

/**
 * @param {Readable} stream 
 */
function readStruct(stream) {
    const struct = Object.create(Struct.prototype);
    while(stream.readableLength) {
        const {tag, value} = readElement(stream);
        if (value === FLAG_STRUCT_END) {
            return struct;
        } else {
            struct[tag] = value;
        }
    }
}

/**
 * @param {Readable} stream 
 */
function readElement(stream) {
    const head = readHead(stream);
    const value = readBody(stream, head.type);
    return {
        tag: head.tag, value
    };
}

//------------------------------------------------------------------

class Nested {
    constructor(data) {
        this.data = data;
    }
}

/**
 * @param {Number} type UInt8 0~13
 * @param {Number} tag UInt8
 * @returns {Buffer}
 */
function createHead(type, tag) {
    if (tag < 15) {
        return Buffer.from([(tag<<4)|type]);
    } else if (tag < 256) {
        return Buffer.from([0xf0|type, tag]);
    } else {
        throw new JceError("Tag must be less than 256");
    }
}

/**
 * @param {Number} type UInt8 0~13
 * @param {Number|BigInt|String|Buffer|Array|Object} value 
 * @returns {Buffer}
 */
function createBody(type, value) {
    var body, len;
    switch (type) {
    case TYPE_INT8:
        return Buffer.from([parseInt(value)]);
    case TYPE_INT16:
        body = Buffer.allocUnsafe(2);
        body.writeInt16BE(parseInt(value));
        return body;
    case TYPE_INT32:
        body = Buffer.allocUnsafe(4);
        body.writeInt32BE(parseInt(value));
        return body;
    case TYPE_INT64:
        body = Buffer.allocUnsafe(8);
        body.writeBigInt64BE(BigInt(value));
        return body;
    case TYPE_FLOAT:
        body = Buffer.allocUnsafe(4);
        body.writeFloatBE(value);
        return body;
    case TYPE_DOUBLE:
        body = Buffer.allocUnsafe(8);
        body.writeDoubleBE(value);
        return body;
    case TYPE_STRING1:
        len = Buffer.from([value.length]);
        return Buffer.concat([len, value]);
    case TYPE_STRING4:
        len = Buffer.allocUnsafe(4);
        len.writeUInt32BE(value.length);
        return Buffer.concat([len, value]);
    case TYPE_MAP:
        body = [];
        let n = 0;
        for (let k of Object.keys(value)) {
            ++n;
            body.push(createElement(TAG_MAP_K, k));
            body.push(createElement(TAG_MAP_V, value[k]));
        }
        body.unshift(createElement(TAG_LENGTH, n));
        return Buffer.concat(body);
    case TYPE_LIST:
        body = [createElement(TAG_LENGTH, value.length)];
        for (let i = 0; i < value.length; ++i) {
            body.push(createElement(TAG_LIST_E, value[i]));
        }
        return Buffer.concat(body);
    // case TYPE_STRUCT_BEGIN:
    // case TYPE_STRUCT_END:
    case TYPE_ZERO:
        return BUF0;
    case TYPE_SIMPLE_LIST:
        return Buffer.concat([createHead(0, TAG_BYTES), createElement(TAG_LENGTH, value.length), value]);
    }
}

/**
 * @param {Number} tag UInt8
 * @param {Number|BigInt|String|Buffer|Array|Object|Nested} value 
 * @returns {Buffer}
 */
function createElement(tag, value) {
    if (value instanceof Nested) {
        const begin = createHead(TYPE_STRUCT_BEGIN, tag);
        const end = createHead(TYPE_STRUCT_END, TAG_STRUCT_END);
        return Buffer.concat([begin, value.data, end]);
    }
    let type = typeof value;
    switch (type) {
    case "string":
        value = Buffer.from(value, _encoding);
        type = value.length <= 0xff ? TYPE_STRING1 : TYPE_STRING4;
        break;
    case "object":
        if (value === null)
            throw new JceError("Unsupported type: null");
        if (value instanceof Uint8Array)
            type = TYPE_SIMPLE_LIST;
        else
            type = Array.isArray(value) ? TYPE_LIST : TYPE_MAP;
        break;
    case "bigint":
    case "number":
        if (value == 0)
            type = TYPE_ZERO;
        else if (Number.isInteger(value) || type === "bigint") {
            if (value >= -0x80 && value <= 0x7f)
                type = TYPE_INT8;
            else if (value >= -0x8000 && value <= 0x7fff)
                type = TYPE_INT16;
            else if (value >= -0x80000000 && value <= 0x7fffffff)
                type = TYPE_INT32;
            else if (value >= -0x8000000000000000n && value <= 0x7fffffffffffffffn)
                type = TYPE_INT64;
            else
                throw new JceError("Unsupported integer range: " + value);
        } else {
            type = TYPE_DOUBLE; //we don't use float
        }
        break;
    default:
        throw new JceError("Unsupported type: " + type);
    }
    const head = createHead(type, tag);
    const body = createBody(type, value);
    return Buffer.concat([head, body]);
}

//--------------------------------------------------------------------

/**
 * 设置字符串编码
 * @param {BufferEncoding} encoding
 */
function setEncoding(encoding = "utf8") {
    _encoding = encoding;
}

/**
 * 调用此函数进行jce解码
 * @param {Buffer} blob 
 * @returns {{[k: number]: any}} 
 */
function decode(blob) {
    const stream = Readable.from(blob, {objectMode: false});
    stream.read(0);
    const result = Object.create(null);
    while(stream.readableLength) {
        const {tag, value} = readElement(stream);
        result[tag] = value;
    }
    return result;
}

/**
 * 调用此函数进行jce编码
 * @param {{[k: number]: any}|any[]} object 键值对或数组(值为null或undefined自动跳过此tag)
 * @param {JceStruct} struct undefined时取object的键为tag
 */
function encode(object, struct = undefined) {
    const elements = [];
    if (!struct) {
        if (Array.isArray(object)) {
            for (let i = 0; i < object.length; ++i) {
                if (object[i] === null || object[i] === undefined)
                    continue;
                elements.push(createElement(i, object[i]));
            }
        } else {
            for (let i of Object.keys(object)) {
                if (object[i] === null || object[i] === undefined)
                    continue;
                elements.push(createElement(parseInt(i), object[i]));
            }
        }
    } else {
        for (const name of Object.keys(struct)) {
            if (!Reflect.has(object, name))
                continue;
            elements.push(createElement(struct[name], object[name]));
        }
    }
    return Buffer.concat(elements);
}

/**
 * 嵌套结构数据必须调用此函数创建，暂不支持在struct中直接定义
 * @param {{[k: number]: any}|any[]} object 
 * @param {JceStruct} struct 
 */
function encodeNested(object, struct = undefined) {
    return new Nested(encode(object, struct));
}

module.exports = {
    setEncoding, decode, encode, encodeNested, Struct, Nested
};
