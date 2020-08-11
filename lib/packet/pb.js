"use strict";
/**
 * @link https://github.com/protobufjs/protobuf.js
 */
const protobuf = require("protobufjs");
const root = protobuf.Root.fromJSON(require("./pb.json"));

/**
 * @param {String} name 
 * @param {Object} object 
 */
function encode(name, object) {
    const pb = root.lookupType(name);
    return pb.encode(pb.create(object)).finish();
}

/**
 * @param {String} name 
 * @param {Buffer} blob 
 */
function decode(name, blob) {
    const pb = root.lookupType(name);
    return pb.toObject(pb.decode(blob));
}

module.exports = {
    encode, decode
};
