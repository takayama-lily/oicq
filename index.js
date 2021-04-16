"use strict";
const { Client, createClient } = require("./lib/client");
const { segment, cqcode } = require("./util");
module.exports = {
    setGlobalConfig: () => { },
    stdin: require("./stdin"),
    segment, cqcode,
    Client, createClient,
};
