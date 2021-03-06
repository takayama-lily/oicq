"use strict";
const { genCQMsg } = require("./lib/message/recv");
const cq = {};
const cqStr = {};

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
    ptt: ["file", "cache", "timeout", "headers", "proxy"],
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
    cq[type] = (...args) => {
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
    cqStr[type] = (...args) => {
        return genCQMsg(cq[type](...args));
    };
}

/**
 * @param {import("./client").MessageElem | import("./client").MessageElem[]} arg 
 */
cq.toString = (arg) => {
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
//     console.log(cq.text("aaa"));
//     console.log(cqStr.text("aaa"));

//     console.log(cq.image("/aaa/bbb"));
//     console.log(cqStr.image("/aaa/bbb"));

//     console.log(cq.image("/aaa/bbb",1));
//     console.log(cqStr.image("/aaa/bbb",true));

//     console.log(cq.music("qq",123));
//     console.log(cqStr.music("163"));

//     console.log(cq.json({"a": 1}));
//     console.log(cqStr.json("{\"a\": 1}"));

//     console.log(cq.toString({
//         type: "at",
//         data: {
//             qq: "all",
//             text: "@全体成员"
//         }
//     }));

//     console.log(cq.toString([
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
    cq, cqStr,
};
