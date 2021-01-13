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

//监听并输入滑动验证码ticket
bot.on("system.login.slider", ()=>{
  process.stdin.once("data", input=>{
    bot.sliderLogin(input);
  });
});

bot.on("message", data=>{
  console.log(data);
  if (data.group_id > 0)
    bot.sendGroupMsg(data.group_id, "hello");
  else
    bot.sendPrivateMsg(data.user_id, "hello");
});

bot.login("password"); // your password or password_md5
```

> [如何获得滑动验证码ticket](https://github.com/takayama-lily/onebot/issues/28)  
> 更详细的例子可以参考 [demo.js](docs/demo.js)  
> API简洁友好，开箱即用，熟悉Nodejs者建议直接引入依赖进行开发。  
> 其他语言的使用者可以用 [http-api](https://github.com/takayama-lily/onebot) 搭建环境。

**相关文档：**

[功能实现程度](./docs/project.md)  
[API](./docs/api.md)  
[事件](./docs/event.md)  
[消息ID规则](./docs/msgid.md)  
[新功能开发计划](https://github.com/takayama-lily/oicq/projects/1)  
[常见问题(登录、风控、掉线等)](https://github.com/takayama-lily/onebot/issues/12)  

**性能和稳定性测试：**

通过Http-Api进行测试，测试账号平均每分钟消息数300+  
内存占用140-160M，CPU占用可忽略不计  
连续挂机天数近50天(截至2021/1/13) [数据统计图](https://user-images.githubusercontent.com/12014361/104422747-821db980-55c0-11eb-8deb-91977e37cc3c.PNG)
