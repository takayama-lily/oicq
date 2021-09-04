"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");

const dir = path.join(os.homedir(), ".oicq");
if (!fs.existsSync(dir))
    fs.mkdirSync(dir);

const confpath = path.join(dir, "config.js");
if (!fs.existsSync(confpath)) {
    fs.copyFileSync(path.join(__dirname, "config.sample.js"), confpath);
    console.log(`
  配置文件不存在，已帮你自动生成，请修改后再次启动程序。
  配置文件在：${confpath}
`);
    process.exit(0);
}

const help = `
  Usage: oicq <account>
  Example: oicq 147258369
`;

const account = parseInt(process.argv[process.argv.length - 1]);
if (account > 10000 && account < 0xffffffff) {
    process.title = "OICQ/OneBot - " + account;
    const config = require(confpath);
    require("./core")(account, Object.assign(config.general, config[account]));
} else {
    console.log(help);
}
