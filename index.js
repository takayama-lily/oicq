"use strict";
const Client = require("./lib/oicq");
const { segment, cqcode } = require("./util");
const { checkUin, NOOP } = require("./lib/common");

module.exports = {
    Client, createClient,
    segment, cqcode,
    /** @deprecated */
    setGlobalConfig: NOOP,
};

const ERROR_UIN = new Error("Argument uin is not an OICQ account.");
function createClient(uin, config) {
    uin = parseInt(uin);
    if (!checkUin(uin))
        throw ERROR_UIN;
    return new Client(uin, config);
}
