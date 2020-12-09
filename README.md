# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![Gitter](https://badges.gitter.im/takayama-lily/oicq.svg)](https://gitter.im/takayama-lily/oicq?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

* QQ(安卓)协议的nodejs实现。也参考了一些其他开源仓库如mirai、miraiGo等。  
* 以高效和稳定为第一目的，在此基础上不断完善，将会逐步支持手机协议的大部分功能。
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数，并且原生支持经典的CQ码。  
* 请使用 `Nodejs 12.16` 以上版本。有bug请告诉我。

----

> API简洁友好，开箱即用，推荐直接引入依赖进行开发。

**Install:**

```bash
# npm i oicq
```

**Example:**

```js
const {createClient} = require("oicq");
const uin = 123456789; // your account
const bot = createClient(uin);

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

**跨进程通信可直接使用：**

[http-api](https://github.com/takayama-lily/onebot)

**使用内置的控制台进行调试：**

```bash
# npm i
# npm test
```

**相关文档：**

[功能实现程度](./docs/project.md)  
[API](./docs/api.md)  
[事件](./docs/event.md)  
[消息ID规则](./docs/msgid.md)  
[登陆失败常见问题](https://github.com/takayama-lily/onebot/issues/12)
