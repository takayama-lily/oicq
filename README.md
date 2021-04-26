# oicq

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)

* QQ(安卓)协议基于Node.js的实现。也参考了一些其他开源仓库如[mirai](https://github.com/mamoe/mirai)、[miraiGo](https://github.com/Mrs4s/MiraiGo)等。  
  * 小巧：依赖包大小仅1M
  * 完善：实现了手机协议大部分常用功能
  * 稳定：基于单线程，易维护，无崩溃，bug率极低
  * 简单：使用CQHTTP风格的API，简洁易懂，原生支持经典CQ码
  * 高效跨平台，低资源占用
* 请使用 `Node.js 12.16` 以上版本。不会支持金钱/红包相关协议。
* [插件站(建设中)](https://github.com/takayama-lily/oicq-plugins)

----

**Install:**

```bash
> npm init    # or > yarn init
> npm i oicq  # or > yarn add oicq
```

**Usage:**

```js
const { createClient } = require("oicq");
const uin = 123456789; // your account
const bot = createClient(uin);

//监听上线事件
bot.on("system.online", () => console.log("Logged in!"));

//监听消息并回复
bot.on("message", (data) => data.reply("hello world"));

//监听滑动验证码事件并输入ticket
bot.on("system.login.slider", () => {
  process.stdin.once("data", (input) => {
    bot.sliderLogin(input);
  });
});

bot.login("password"); // your password or password_md5
```

> [如何完成滑动验证码并拿到ticket](https://github.com/takayama-lily/oicq/wiki/01.%E6%BB%91%E5%8A%A8%E9%AA%8C%E8%AF%81%E7%A0%81%E5%92%8C%E8%AE%BE%E5%A4%87%E9%94%81)  
> 更详细的例子可以参考 [demo.js](docs/demo.js)  
> API简洁友好，开箱即用，熟悉Nodejs者建议直接引入依赖进行开发。  
> 其他语言的使用者可以用 [http-api](https://github.com/takayama-lily/onebot) 搭建环境。  

**相关文档：**

[API参考文档](https://github.com/takayama-lily/oicq/wiki/91.API%E6%96%87%E6%A1%A3)  
[事件参考文档](https://github.com/takayama-lily/oicq/wiki/92.%E4%BA%8B%E4%BB%B6%E6%96%87%E6%A1%A3)  
[常见问题](https://github.com/takayama-lily/oicq/wiki/02.%E5%85%B6%E4%BB%96%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)  
[wiki列表](https://github.com/takayama-lily/oicq/wiki)  

**其他：**

[JavaScript语言基础](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)  
[Node.js入门教程](http://nodejs.cn/learn)  
[5分钟上手TypeScript](https://www.tslang.cn/docs/handbook/typescript-in-5-minutes.html)  
[![Gitter](https://badges.gitter.im/takayama-lily/oicq.svg)](https://gitter.im/takayama-lily/oicq?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![group:236172566](https://img.shields.io/badge/group-236172566-blue)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)
