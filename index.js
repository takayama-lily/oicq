"use strict";
const { Client, createClient } = require("./lib/client");
const { segment, cqcode } = require("./util");
module.exports = {
    setGlobalConfig: () => { },
    console: require("./console"),
    segment, cqcode,
    Client, createClient,
};
