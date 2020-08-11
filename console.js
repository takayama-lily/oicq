"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const oicq = require("./lib/client");

/**
 * 一个简单的控制台，仅用来调试
 * "npm test"或"node ./test"启动
 */

var bot = null;
function account() {
    console.log("请输入账号：");
    process.stdin.once("data", (input)=>{
        try {
            input = parseInt(input.toString().trim());
            bot = oicq.createClient(input, {
                log_level: "trace"
            });

            //处理验证码事件
            bot.on("login.notice.captcha", async(resp)=>{
                const file_path = path.join(process.mainModule.path, `captcha-${account}.jpg`);
                await fs.promises.writeFile(file_path, resp.error.message);
                bot.logger.info(`验证码已更新并保存到文件(${file_path})，请查看并输入: `);
                process.stdin.once("data", (input)=>{
                    bot.captchaLogin(input);
                });
            });

            //处理设备锁验证事件
            bot.on("login.notice.device", (resp)=>{
                bot.logger.info(`请去以下地址验证解锁: ` + resp.error.message);
                process.stdin.once("data", ()=>{
                    bot.login();
                });
            });

            //处理其他登陆失败事件
            bot.on("login.error", (resp)=>{
                if (resp.error.message) {
                    bot.logger.error("["+resp.error.title+"]" + resp.error.message);
                    if (resp.error.message.includes("密码"))
                        password();
                } else
                    bot.logger.error("[登陆失败]未知错误。");

            });

            // 登陆成功
            bot.on("online", loop);
        } catch (e) {
            console.log(e.message);
            return account();
        }
        password();
    })
}
function password() {
    console.log("请输入密码：");
    process.stdin.once("data", (input)=>{
        input = input.toString().trim();
        const password_md5 = crypto.createHash("md5").update(input).digest();
        bot.login(password_md5);
    })
}
function loop() {
    const help = `※发言：send 群号或QQ号 message
※退出: bye`;
    console.log("欢迎来到控制台！");
    console.log(help);
    const listener = function(input) {
        input = input.toString().trim();
        const cmd = input.split(" ");
        switch (cmd[0]) {
            case "send":
            case "say":
                console.log("施工中。");
                break;
            case "bye":
                bot.terminate();
                process.stdin.destroy();
                break;
            default:
                console.log("指令错误。");
                console.log(help);
                break;
        }
    }
    process.stdin.on("data", listener);
}

function main() {
    if (!bot)
        account();
}

module.exports = main;
