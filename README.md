# oicq

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![Gitter](https://badges.gitter.im/takayama-lily/oicq.svg)](https://gitter.im/takayama-lily/oicq?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

* QQ(安卓)协议的nodejs实现。也参考了一些其他开源仓库如[mirai](https://github.com/mamoe/mirai)、[miraiGo](https://github.com/Mrs4s/MiraiGo)等。  
* 以高效和稳定为第一目的，在此基础上不断完善，将会逐步支持手机协议的大部分功能。
* 使用 酷Q和CQHTTP 风格的API、事件和参数，原生支持经典的CQ码。  
* 请使用 `Nodejs 12.16` 以上版本。有bug请告诉我。
* [开发和贡献插件](https://github.com/takayama-lily/oicq-plugins)

----

**Install:**

```bash
# npm init
# npm i oicq
```

**Usage:**

```js
const { createClient } = require("oicq");
const uin = 123456789; // your account
const bot = createClient(uin);

//监听并输入滑动验证码ticket
bot.on("system.login.slider", () => {
  process.stdin.once("data", (input) => {
    bot.sliderLogin(input);
  });
});

bot.on("system.online" () => console.log("上线了！"));

//回复消息
bot.on("message", (data) => data.reply("hello world"));

bot.login("password"); // your password or password_md5
```

> [如何获得滑动验证码ticket](https://github.com/takayama-lily/oicq/wiki/01.%E6%BB%91%E5%8A%A8%E9%AA%8C%E8%AF%81%E7%A0%81%E5%92%8C%E8%AE%BE%E5%A4%87%E9%94%81)  
> 更详细的例子可以参考 [demo.js](docs/demo.js)  
> API简洁友好，开箱即用，熟悉Nodejs者建议直接引入依赖进行开发。  
> 其他语言的使用者可以用 [http-api](https://github.com/takayama-lily/onebot) 搭建环境。  

**相关文档：**

[API列表](https://github.com/takayama-lily/oicq/wiki/91.API%E6%96%87%E6%A1%A3)  
[事件列表](https://github.com/takayama-lily/oicq/wiki/92.%E4%BA%8B%E4%BB%B6%E6%96%87%E6%A1%A3)  
[常见问题](https://github.com/takayama-lily/oicq/wiki/02.%E5%85%B6%E4%BB%96%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)  
[wiki列表](https://github.com/takayama-lily/oicq/wiki)  

**其他：**

[JavaScript语言基础](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)  
[七天学会NodeJS](https://github.com/nqdeng/7-days-nodejs)  
[5分钟上手TypeScript](https://www.tslang.cn/docs/handbook/typescript-in-5-minutes.html)  
[![交流群反馈群](https://img.shields.io/badge/交流群反馈群-236172566-red)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)
