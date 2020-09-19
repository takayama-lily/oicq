# OICQ

[![npm version](https://img.shields.io/npm/v/oicq.svg?logo=npm)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq.svg)](https://nodejs.org)

* QQ(安卓)协议的nodejs实现。参考了一些其他开源仓库如mirai、miraiGo。以高效和稳定为第一目的，同时保证功能不断添加。  
* 使用 [CQHTTP](https://cqhttp.cc) 风格的API、事件和参数(少量差异)，并且原生支持经典的CQ码。  
* 本项目使用AGPL-3.0许可证，旨在学习。不推荐也不提供商业化使用的支持。

**目前可以直接使用的SDK或应用程序**

[http-api](https://github.com/takayama-lily/onebot)

**作为依赖引入进行开发：**

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

**使用内置的控制台进行调试：**

```bash
# npm i
# npm test
```

**文档：**

[开发进度](./docs/project.md)  
[API和事件](./docs/api.md)
