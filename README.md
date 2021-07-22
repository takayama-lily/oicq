# oicq

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![discord](https://img.shields.io/static/v1?label=chat&message=on%20discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)

* QQ(安卓)协议基于Node.js的实现，使用CQHTTP风格的API，原生支持CQ码
* 已实现大部分常用功能，支持最低node版本为 v12.16

----

**Install:**

```bash
> npm i oicq  # or > yarn add oicq
```

**Usage:**

```js
const { createClient } = require("oicq");
const uin = 123456789; // your account
const client = createClient(uin);

//监听上线事件
client.on("system.online", () => console.log("Logged in!"));

//监听消息并回复
client.on("message", (data) => data.reply("hello world"));

/****************************************
 * 手机QQ扫描二维码登录，与下面的传统密码登录二选一
 * 优点是不需要过滑块和设备锁
 * 缺点是万一token失效需要重新扫码验证
 */
client.on("system.login.qrcode", function (data) {
  console.log(data)
  process.stdin.once("data", () => {
    this.login(); //扫码后按回车登录
  });
});
client.login(); //这里不填写密码

/****************************************
 * 传统密码登录
 * 缺点是需要过滑块，可能会报环境异常
 * 优点是一劳永逸
 */
client.on("system.login.slider", function (data) { //监听滑动验证码事件
  console.log(data)
  process.stdin.once("data", (input) => {
    this.sliderLogin(input); //输入ticket
  });
});
client.on("system.login.device", function (data) { //监听登录保护验证事件
  console.log(data)
  process.stdin.once("data", () => {
    this.login(); //验证完成后按回车登录
  });
});
client.login("password"); //需要填写密码或md5后的密码
```

**常用功能：**

```js
client.sendGroupMsg(gid, "hello") //群聊
client.sendPrivateMsg(uid, "hello") //私聊
client.deleteMsg(id) //撤回
client.setGroupKick(gid, uid) //踢人
client.setGroupBan(gid, uid, 3600) //禁言
```

> 更详细的例子：[demo.js](docs/demo.js)  
> 更多API：[index.d.ts](https://github.com/takayama-lily/oicq/blob/b600469337bf9ecd5a871413661d56c6325afce3/index.d.ts#L655)  

**相关文档：**

[滑动验证码ticket教程](https://github.com/takayama-lily/oicq/wiki/01.%E6%BB%91%E5%8A%A8%E9%AA%8C%E8%AF%81%E7%A0%81%E5%92%8C%E8%AE%BE%E5%A4%87%E9%94%81)  
[API参考文档](https://github.com/takayama-lily/oicq/wiki/91.API%E6%96%87%E6%A1%A3)  
[事件参考文档](https://github.com/takayama-lily/oicq/wiki/92.%E4%BA%8B%E4%BB%B6%E6%96%87%E6%A1%A3)  
[常见问题](https://github.com/takayama-lily/oicq/wiki/02.%E5%85%B6%E4%BB%96%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)  
[关于封号和风控](https://github.com/takayama-lily/oicq/wiki/98.%E5%85%B3%E4%BA%8E%E8%B4%A6%E5%8F%B7%E5%86%BB%E7%BB%93%E5%92%8C%E9%A3%8E%E6%8E%A7)  
[wiki列表](https://github.com/takayama-lily/oicq/wiki)  
[awesome](./awesome.md) 社区相关应用收集

**其他：**

[JavaScript语言基础](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)  
[Node.js入门教程](http://nodejs.cn/learn)  
[5分钟上手TypeScript](https://www.tslang.cn/docs/handbook/typescript-in-5-minutes.html)  
[![group:236172566](https://img.shields.io/badge/group-236172566-blue)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)
