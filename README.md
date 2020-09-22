# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)

* QQ(安卓)协议的nodejs实现。参考了一些其他开源仓库如mirai、miraiGo等。  
* 以高效和稳定为第一目的，在此基础上不断完善功能。  
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数(少量差异)，并且原生支持经典的CQ码。  
* 本项目使用AGPL-3.0许可证，旨在学习。不推荐也不提供商业化使用的支持。
* 使用本项目产生的一切后果与本人无关。

<details>
<summary>一些想说的话</summary>
  如果你有一门技术，可以促进社会发展，但也可以为违法犯罪提供便利，<br>
  在你无法完全掌控和管理的情况下，你会公之于众吗？<br>
  之前以为开源就是正义，现在看来也并不完全如此（可参考DeepFake事件）。<br>
  开源QQ机器人，还能走多远？
</details>

----

**目前可以直接使用的SDK或应用程序**

[http-api](https://github.com/takayama-lily/onebot)

**作为依赖引入进行开发（简单demo）：**

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

**使用内置的控制台进行调试：**

```bash
# npm i
# npm test
```

**文档：**

[功能实现程度](./docs/project.md)  
[API和事件](./docs/api.md)
