# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org) ← 注意版本

* QQ(安卓)协议的nodejs实现。也参考了一些其他开源仓库如mirai、miraiGo等。  
* 以高效和稳定为第一目的，在此基础上不断完善功能。  
* 将会逐步支持手机协议的大部分功能。
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数(少量差异)，并且原生支持经典的CQ码。  
* 本项目使用AGPL-3.0许可证，旨在学习。不推荐也不提供商业化使用的支持。
* 有bug请告诉我！PR请基于dev分支！

----

**API简洁友好，开箱即用，推荐直接引入依赖进行开发。**

```bash
# npm i oicq
```

```js
const oicq = require("oicq");
const uin = 123456789;
const bot = oicq.createClient(uin);

bot.on("system.login.captcha", ()=>{
  process.stdin.once("data", input=>{
    bot.captchaLogin(input);
  });
});

bot.on("message", data=>console.log(data));
bot.on("request", data=>console.log(data));
bot.on("notice", data=>console.log(data));

const password_md5 = "202cb962ac59075b964b07152d234b70";
bot.login(password_md5);
```

[登陆失败常见问题](https://github.com/takayama-lily/onebot/issues/12)

**如果需要跨进程的通信，可以使用：**

[http-api](https://github.com/takayama-lily/onebot)

**使用内置的控制台进行调试：**

```bash
# npm i
# npm test
```

**文档：**

[功能实现程度](./docs/project.md)  
[API](./docs/api.md)  
[事件](./docs/event.md)
