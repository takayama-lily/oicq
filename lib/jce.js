/**
 * jce组包解包
 */
"use strict";
const jce = require("jce");
const WRAPPER = {
    version: 1,
    pkt_type: 2,
    msg_type: 3,
    req_id: 4,
    service: 5,
    method: 6,
    payload: 7,
    timeout: 8,
    context: 9,
    status: 10,
};

/**
 * @param {Buffer} blob 
 */
function decode(blob) {
    const wrapper = jce.decode(blob);
    const map = jce.decode(wrapper[7])[0];
    let nested = map[Object.keys(map)[0]];
    if (nested instanceof Buffer === false)
        nested = nested[Object.keys(nested)[0]];
    return jce.decode(nested)[0];
}

/**
 * @param {object} map 
 * @param {typeof WRAPPER} extra 
 */
function encodeWrapper(map, extra) {
    const body = {
        version: 3,
        pkt_type: 0,
        msg_type: 0,
        req_id: 0,
        service: "",
        method: "",
        payload: jce.encode([map]),
        timeout: 0,
        context: {},
        status: {},
        ...extra
    };
    return jce.encode(body, WRAPPER);
}

/**
 * @param {object|Array} nested 
 * @param {object|undefined} struct 
 */
function encodeStruct(nested, struct) {
    return jce.encode([jce.encodeNested(nested, struct)]);
}

module.exports = {
    decode, decodeNested: jce.decode,
    encode: jce.encode, encodeWrapper, encodeStruct, encodeNested: jce.encodeNested,
};
