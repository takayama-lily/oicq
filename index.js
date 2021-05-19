"use strict";
const { Client, createClient } = require("./lib/oicq");
const { segment, cqcode } = require("./util");
module.exports = {
    setGlobalConfig: () => { },
    segment, cqcode,
    Client, createClient,
};
