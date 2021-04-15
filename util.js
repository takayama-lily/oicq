/**
 * 常用工具包
 */
"use strict";
const { genCQMsg } = require("./lib/message/parser");
const segment = {};
const cqcode = {};

/**
 * @type {{[k: string]: string[]}}
 */
const elem_map = {
    text: ["text"],
    at: ["qq", "text", "dummy"],
    face: ["id", "text"],
    sface: ["id", "text"],
    bface: ["file", "text"],
    rps: ["id"],
    dice: ["id"],
    image: ["file", "cache", "timeout", "headers", "proxy"],
    flash: ["file", "cache", "timeout", "headers", "proxy"],
    record: ["file", "cache", "timeout", "headers", "proxy"],
    location: ["lat", "lng", "address", "id"],
    music: ["type", "id"],
    json: ["data"],
    xml: ["data", "type"],
    share: ["url", "title", "image", "content"],
    shake: [],
    poke: ["type", "id"],
    reply: ["id"],
    node: ["id"],
    anonymous: ["ignore"],
};

for (const [type, params] of Object.entries(elem_map)) {
    segment[type] = (...args) => {
        const data = {};
        for (let i = 0; i < params.length; ++i) {
            if (Reflect.has(args, i)) {
                data[params[i]] = args[i];
            }
        }
        return {
            type, data,
        };
    };
    cqcode[type] = (...args) => {
        return genCQMsg(segment[type](...args));
    };
}

/**
 * @param {import("./index").MessageElem | import("./index").MessageElem[]} arg 
 */
segment.toCqcode = (arg) => {
    if (typeof arg === "string")
        return arg;
    if (typeof arg[Symbol.iterator] === "function") {
        let str = "";
        for (let elem of arg) {
            str += genCQMsg(elem);
        }
        return str;
    } else {
        return genCQMsg(arg);
    }
};

// function test() {
//     console.log(segment.text("aaa"));
//     console.log(cqcode.text("aaa"));

//     console.log(segment.image("/aaa/bbb"));
//     console.log(cqcode.image("/aaa/bbb"));

//     console.log(segment.image("/aaa/bbb",1));
//     console.log(cqcode.image("/aaa/bbb",true));

//     console.log(segment.music("qq",123));
//     console.log(cqcode.music("163"));

//     console.log(segment.json({"a": 1}));
//     console.log(cqcode.json("{\"a\": 1}"));

//     console.log(segment.toCqcode({
//         type: "at",
//         data: {
//             qq: "all",
//             text: "@全体成员"
//         }
//     }));

//     console.log(segment.toCqcode([
//         {
//             type: "at",
//             data: {
//                 qq: "all",
//                 text: "@全体成员"
//             }
//         },
//         {
//             type: "image",
//             data: {
//                 file: "[123456&&&,,,]"
//             }
//         },
//     ]));
// }
// test();

module.exports = {
    segment, cqcode,
};
