"use strict";
const { Client, createClient } = require("./lib/client");
const { segment, cqcode } = require("./util");
module.exports = {
    setGlobalConfig: () => { },
    segment, cqcode,
    Client, createClient,
};
