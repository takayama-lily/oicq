/**
 * 简易控制台指令分发器
 */
"use strict";
const { EventEmitter } = require("events");

const emitter = new EventEmitter();

function registerCommand(cmd, cb) {
    emitter.on(cmd, cb);
}

function deregisterCommand(cmd, cb) {
    emitter.off(cmd, cb);
}

function listener(input) {
    input = String(input).trim();
    for (let name of emitter.eventNames()) {
        if (input.startsWith(name)) {
            emitter.emit(name, input);
        }
    }
}

function enable() {
    process.stdin.off("data", listener);
    process.stdin.on("data", listener);
}

function disable() {
    process.stdin.off("data", listener);
}

module.exports = {
    registerCommand, deregisterCommand, enable, disable
};
