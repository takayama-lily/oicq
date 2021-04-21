"use strict";
try {
    var { createClient } = require("oicq");
} catch {
    var { createClient } = require("../index");
}

// your account
const uin = 123456789;
const bot = createClient(uin, {
    log_level: "debug", //日志级别设置为debug
    platform: 5, //登录设备选择为iPad
});

//监听并输入滑动验证码ticket(同一设备只需验证一次)
bot.on("system.login.slider", () => {
    process.stdin.once("data", (input) => {
        bot.sliderLogin(input);
    });
});

//监听设备锁验证(同一设备只需验证一次)
bot.on("system.login.device", () => {
    bot.logger.info("验证完成后敲击Enter继续..");
    process.stdin.once("data", () => {
        bot.login();
    });
});

//监听上线事件
bot.on("system.online", function () {
    console.log(`Logged in as ${this.nickname}!`);
});

//自动同意好友申请
bot.on("request.friend.add", (data) => {
    bot.setFriendAddRequest(data.flag);
});

//自动同意群邀请
bot.on("request.group.invite", (data) => {
    bot.setGroupAddRequest(data.flag);
});

//监听私聊
bot.on("message.private", (data) => {
    // console.log(data);
    bot.sendPrivateMsg(data.user_id, "hello");
});

//监听群聊
bot.on("message.group", (data) => {
    // console.log(data);
    bot.sendGroupMsg(data.group_id, "hello");
});

//监听群员入群事件
bot.on("notice.group.increase", (data) => {
    bot.sendGroupMsg(data.group_id, data.nickname + " 加入了群");
});

// login with your password or password_md5
bot.login("password");

//同一事件可以多次监听
//更多api和事件请参考文档或index.d.ts文件
