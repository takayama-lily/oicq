"use strict";
const https = require("https");
const oicq = require("./index");

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
                log_level: "debug", ignore_self: false, platform: oicq.constants.PLATFORM_IPAD
            });

            bot.on("system.login.qrcode", (data) => {
                process.stdin.once("data", (input)=>{
                    bot.login();
                });
            })

            //处理滑动验证码事件
            bot.on("system.login.slider", ()=>{
                process.stdin.once("data", (input)=>{
                    bot.sliderLogin(input);
                });
            });

            //处理设备锁验证事件
            bot.on("system.login.device", (data)=>{
                process.stdin.once("data", ()=>{
                    bot.login();
                });
            });

            //处理其他登陆失败事件
            bot.on("system.login.error", (data)=>{
                if (data.message.includes("密码错误"))
                    password();
                else
                    bot.terminate();
            });

            // 登陆成功
            bot.once("system.online", loop);

            // 下线
            bot.once("system.offline", (data)=>{
                console.log(data);
            });

            bot.on("internal.timeout", (data)=>{
                console.log(data);
            });

            bot.on("request", (data)=>{
                console.log("收到request事件", data);
            });
            bot.on("notice", (data)=>{
                console.log("收到notice事件", data);
            });
            bot.on("message", (data)=>{
                // console.log("收到message事件", data);
            });
            bot.on("sync", (data)=>{
                console.log("收到sync事件", data);
            });
            bot.on("internal.sso", (data)=>{
                // console.log("收到数据包", data);
            });
        } catch (e) {
            console.log(e.message);
            return account();
        }
        password();
    });
}
function password() {
    console.log("请输入密码：");
    process.stdin.once("data", (input)=>{
        input = input.toString().trim();
        bot.login(input);
    });
}
function loop() {
    const help = `※友情提示：将log_level设为trace可获得详细的收发包信息。
※发言: send target msg
※退出: bye
※执行任意代码: eval code`;
    console.log(help);
    const listener = async function(input) {
        input = input.toString().trim();
        const cmd = input.split(" ")[0];
        const param = input.replace(cmd, "").trim();
        switch (cmd) {
        case "bye":
            bot.logout();
            process.stdin.destroy();
            break;
        case "send":
            const abc = param.split(" ");
            const target = parseInt(abc[0]);
            let res;
            if (bot.gl.has(target))
                res = await bot.sendGroupMsg(target, abc[1]);
            else
                res = await bot.sendPrivateMsg(target, abc[1]);
            console.log("发送消息结果", res);
            break;
        case "eval":
            try {
                let res = eval(param);
                if (res instanceof Promise)
                    res = await res;
                console.log("执行结果", res);
            } catch (e) {
                console.log(e.stack);
            }
            break;
        default:
            console.log("指令错误。");
            console.log(help);
            break;
        }
    };
    process.stdin.on("data", listener);
}

if (!bot) {
    console.log("欢迎来到调试台！");
    account();
}

async function get(url, domain) {
    const cookie = (await bot.getCookies(domain)).data.cookies;
    https.get(url, { headers: { cookie } }, (res) => {
        res.setEncoding("utf-8");
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => console.log(data));
    });
}

async function post(url, domain, data) {
    const cookie = (await bot.getCookies(domain)).data.cookies;
    https.request(url, { headers: { cookie, "Content-Length": Buffer.byteLength(data) }, method: "POST" }, (res) => {
        res.setEncoding("utf-8");
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => console.log(data));
    }).end(data);
}
