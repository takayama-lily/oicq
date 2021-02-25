# oicq

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![Gitter](https://badges.gitter.im/takayama-lily/oicq.svg)](https://gitter.im/takayama-lily/oicq?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![bug反馈群](https://img.shields.io/badge/bug反馈群-236172566-red)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)

* QQ(安卓)协议的nodejs实现。也参考了一些其他开源仓库如[mirai](https://github.com/mamoe/mirai)、[miraiGo](https://github.com/Mrs4s/MiraiGo)等。  
* 以高效和稳定为第一目的，在此基础上不断完善，将会逐步支持手机协议的大部分功能。
* 使用 酷Q和CQHTTP 风格的API、事件和参数，原生支持经典的CQ码。  
* 请使用 `Nodejs 12.16` 以上版本。有bug请告诉我。

----

**Install:**

```bash
# npm i oicq
```

**Example:**

```js
const { createClient } = require("oicq");
const uin = 123456789; // your account
const bot = createClient(uin);

//监听并输入滑动验证码ticket
bot.on("system.login.slider", (data) => {
  process.stdin.once("data", (input) => {
    bot.sliderLogin(input);
  });
});

bot.on("message", (data) => {
  if (data.group_id > 0)
    bot.sendGroupMsg(data.group_id, "hello");
  else
    bot.sendPrivateMsg(data.user_id, "hello");
});

bot.login("password"); // your password or password_md5
```

> [如何获得滑动验证码ticket](https://github.com/takayama-lily/oicq/wiki/01.%E6%BB%91%E5%8A%A8%E9%AA%8C%E8%AF%81%E7%A0%81%E5%92%8C%E8%AE%BE%E5%A4%87%E9%94%81)  
> 更详细的例子可以参考 [demo.js](docs/demo.js)  
> API简洁友好，开箱即用，熟悉Nodejs者建议直接引入依赖进行开发。  
> 其他语言的使用者可以用 [http-api](https://github.com/takayama-lily/onebot) 搭建环境。

**相关文档：**

[wiki](https://github.com/takayama-lily/oicq/wiki)  
