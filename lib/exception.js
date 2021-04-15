/**
 * 错误码和错误消息
 */
"use strict";
const troop = require("./troop");
const chat = require("./message/chat");

/**
 * @type {Map<Function, {[k: number]: string}>}
 */
const exceptions = new Map([
    [troop.kickMember, {
        2: "权限不足"
    }],
    [troop.setAdmin, {
        2: "权限不足",
        3: "不存在的群员",
        7: "权限不足"
    }],
    [troop.setTitle, {
        1013: "权限不足"
    }],
    [troop.setCard, {
        1: "权限不足"
    }],
    [troop.addFriend, {
        2: "对方拒绝被添加",
        3: "需要正确回答问题(暂不支持)",
        101: "已经是好友"
    }],
    [chat.sendMsg, {
        10: "发送失败，消息太长",
        120: "发送失败，在该群被禁言"
    }],
]);

class TimeoutError extends Error { }

/**
 * @param {Function} fn 
 * @param {number} code 
 */
function getErrorMessage(fn, code) {
    if (!exceptions.has(fn))
        return "unknown";
    const e = exceptions.get(fn);
    if (!e[code])
        return "unknown";
    return e[code];
}

module.exports = {
    getErrorMessage, TimeoutError
};
