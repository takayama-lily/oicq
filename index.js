"use strict";
const Client = require("./lib/oicq");
const { segment, cqcode } = require("./util");
const { checkUin, NOOP } = require("./lib/common");

const constants = {
    PLATFORM_ANDROID: 1,
    PLATFORM_APAD: 2,
    PLATFORM_WATCH: 3,
    PLATFORM_IMAC: 4,
    PLATFORM_IPAD: 5,
    STATUS_ONLINE: 11,
    STATUS_ABSENT: 31,
    STATUS_INVISIBLE: 41,
    STATUS_BUSY: 50,
    STATUS_QME: 60,
    STATUS_NODISTURB: 70,
}

module.exports = {
    Client, createClient,
    segment, cqcode,
    /** @deprecated */
    setGlobalConfig: NOOP,
    constants,
};

const ERROR_UIN = new Error("Argument uin is not an OICQ account.");
function createClient(uin, config) {
    uin = parseInt(uin);
    if (!checkUin(uin))
        throw ERROR_UIN;
    return new Client(uin, config);
}
