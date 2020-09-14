# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)

* QQ(安卓)协议的nodejs实现，参考了 [mirai](https://github.com/mamoe/mirai) 和 [MiraiGo](https://github.com/Mrs4s/MiraiGo) ，全异步，高效、稳定、简洁、跨平台。  
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数(少量差异)，并且原生支持经典的CQ码。  
* 一切旨在学习。本项目使用AGPL-3.0许可证。不推荐也不提供商业化使用的支持。
* 推荐使用 [httpapi](https://github.com/takayama-lily/onebot) 。

**使用内置的控制台：**

```bash
# npm i
# npm test
```

**作为依赖引入：**

```bash
# npm i oicq
```

```js
const oicq = require("oicq");
const uin = 123456789;
const password_md5 = "202cb962ac59075b964b07152d234b70";
const bot = oicq.createClient(uin);
bot.login(password_md5);
```

**文档：**

[开发进度](./docs/project.md)  
[API和事件](./docs/api.md)
