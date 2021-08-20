# oicq

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![dm](https://shields.io/npm/dm/oicq)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)
[![discord](https://img.shields.io/static/v1?label=chat&message=on%20discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)

* QQ(安卓)协议基于Node.js的实现，使用CQHTTP风格的API
* 高度抽象地封装了大部分常用功能，支持最低node版本为 v12.16
* 若你不熟悉Node.js或不会组织代码，可通过 [template](https://github.com/takayama-lily/oicq-template) 创建一个简单的应用程序
* [API参考文档](https://github.com/takayama-lily/oicq/wiki/91.API%E6%96%87%E6%A1%A3) / [事件参考文档](https://github.com/takayama-lily/oicq/wiki/92.%E4%BA%8B%E4%BB%B6%E6%96%87%E6%A1%A3)
* [wiki](https://github.com/takayama-lily/oicq/wiki) 列表
* [码云镜像仓库](https://gitee.com/takayama/oicq)

----

**Install:**

```bash
> npm i oicq  # or > yarn add oicq
```

**Usage:**

```js
const { createClient } = require("oicq");
const account = 123456789;
const client = createClient(account);

//监听上线事件
client.on("system.online", () => console.log("Logged in!"));

//监听消息并回复
client.on("message", (event) => event.reply("hello world"));

/****************************************
 * 手机QQ扫描二维码登录(与下面的密码登录二选一)
 * 优点是不需要过滑块和设备锁
 * 缺点是万一token失效，无法自动登录，需要重新扫码
 */
client.on("system.login.qrcode", function (event) {
  process.stdin.once("data", () => {
    this.login(); //扫码后按回车登录
  });
}).login(); //这里不填写密码

//-------------------------------------------------------------------------

/****************************************
 * 密码登录
 * 缺点是需要过滑块，可能会报环境异常
 * 优点是一劳永逸
 */
client.on("system.login.slider", function (event) { //监听滑动验证码事件
  process.stdin.once("data", (input) => {
    this.sliderLogin(input); //输入ticket
  });
}).on("system.login.device", function (event) { //监听登录保护验证事件
  process.stdin.once("data", () => {
    this.login(); //验证完成后按回车登录
  });
}).login("password"); //需要填写密码或md5后的密码
```

**常用功能：**

```js
client.sendGroupMsg(gid, "hello") //群聊
client.sendPrivateMsg(uid, "hello") //私聊
client.deleteMsg(id) //撤回
client.setGroupKick(gid, uid) //踢人
client.setGroupBan(gid, uid, 3600) //禁言
```

**其他：**

* [常见问题](https://github.com/takayama-lily/oicq/wiki/02.%E5%85%B6%E4%BB%96%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98) (登录、风控等相关问题)
* [QQWebApi](./web-api.md) QQ Web Api 收集
* [awesome](./awesome.md) 社区相关应用收集

 [![group:236172566](https://img.shields.io/badge/group-236172566-blue)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)
