# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![Gitter](https://badges.gitter.im/takayama-lily/oicq.svg)](https://gitter.im/takayama-lily/oicq?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

* QQ(安卓)协议的nodejs实现。也参考了一些其他开源仓库如mirai、miraiGo等。  
* 以高效和稳定为第一目的，在此基础上不断完善，将会逐步支持手机协议的大部分功能。
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数，并且原生支持经典的CQ码。  
* 请使用 `Nodejs 12.16` 以上版本。有bug请告诉我。
* 内核已完全稳定，希望更多热爱JS/TS的玩家一同来完善社区和生态。

----

**Install:**

```bash
# npm i oicq
```

**Example:**

```js
const {createClient} = require("oicq");
const uin = 123456789; // your account
const bot = createClient(uin);

//监听并输入验证码
bot.on("system.login.captcha", ()=>{
  process.stdin.once("data", input=>{
    bot.captchaLogin(input);
  });
});

bot.on("message", data=>{
  console.log(data);
  if (data.group_id > 0)
    bot.sendGroupMsg(data.group_id, "hello");
  else
    bot.sendPrivateMsg(data.user_id, "hello");
});

const password = "password";  // your password or password_md5
bot.login(password);
```

> 更详细的例子可以参考 [demo.js](docs/demo.js) (内有滑动验证码等处理细节)  
> API简洁友好，开箱即用，熟悉Nodejs者建议直接引入依赖进行开发。  
> 其他语言的使用者可以用 [http-api](https://github.com/takayama-lily/onebot) 搭建环境。

**相关文档：**

[功能实现程度](./docs/project.md)  
[API](./docs/api.md)  
[事件](./docs/event.md)  
[消息ID规则](./docs/msgid.md)  
[登陆失败常见问题](https://github.com/takayama-lily/onebot/issues/12)
