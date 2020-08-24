# API和事件

+ [oicq.createClient](#oicq.createClient(uin[,config]))
+ [Class: oicq.Client](#Class-Client)
  + [Events](#Events)
    + [Event: system](#Event-system)
    + [Event: message](#Event-message)
    + [Event: request](#Event-request)
    + [Event: notice](#Event-notice)
  + [APIs](#APIs)
    + [client.login(password_md5)](#client.login(password_md5))
    + [client.captchaLogin(captcha)](#client.captchaLogin(captcha))
    + [client.terminate()](#client.terminate())

----

## `oicq.createClient(uin[,config])`

+ `uin` \<number>
+ `config` \<Object>

创建一个实例：

```js
const oicq = require("oicq");
const uin = 123456789, config = {};
const client = oicq.createClient(uin, config);
```

config说明：

```js
//默认配置
const config = {
    platform:       2,      //登陆类型 1手机 2平板
    log_level:      "info", //日志级别，有trace,debug,info,warn,error,fatal,off
    kickoff:        false,  //被挤下线是否在3秒后反挤对方
    ignore_self:    true,   //群聊是否无视自己的发言
    device_path:            //设备文件保存路径，默认为启动文件同目录下的data文件夹
};
```

----

## Class: `Client`

只能使用工厂方法 createClient 创建实例。

----

## Events

使用 `client.on()` 来监听一个事件：

```js
client.on("system.login", (data)=>{
    console.log(data);
});
```

事件为冒泡传递，例如 `request.group.add` 事件，若未监听会沿着 `request.group `传递到 `request`  
事件使用cqhttp风格命名和参数，所有事件数据都为json对象，并包含以下共通字段：

+ `self_id`
+ `time` 毫秒级
+ `post_type` 一级分类 system, message, request, notice
+ `{post_type}_type` 二级分类如 system.login, request.group
+ `sub_type` 三级分类，有时会没有

----

## Event: system

+ system.login
  + system.login.captcha `image` 字段为图像Buffer
  + system.login.device `url` 字段为设备锁验证地址
  + system.login.error `message` 字段为失败原因
+ system.online 上线事件，可以开始处理消息
+ system.offline 下线事件
  + system.offline.network 网络断开
  + system.offline.frozen 被冻结(未测试)
  + system.offline.kickoff 另一处登陆
  + system.offline.unknown 未知
+ system.reconn 断线重连时触发，重连后会触发online事件

----

## Event: message

+ message.private
  + message.private.friend
  + message.private.single 单向好友(对方未加你)
  + message.private.group 群临时会话
  + message.private.other 其他途径临时会话
+ message.group
  + message.group.normal
  + message.group.anonymous
  + message.group.notice

----

## Event: request

+ request.friend
  + message.friend.add
+ request.group
  + message.group.add
  + message.group.invite

----

## Event: notice

为了统一风格，notice事件的命名和原版cqhttp有一定出入

+ notice.friend
  + notice.friend.increase
  + notice.friend.recall
+ notice.group
  + notice.group.increase
  + notice.group.decrease
  + notice.group.recall
  + notice.group.admin
  + notice.group.transfer 群转让
  + notice.group.ban
  + notice.group.kick

----

## `client.login(password_md5)`

+ `password_md5` \<string|Buffer>

md5后的密码，可以是字符串或Buffer

----

## `client.captchaLogin(captcha)`

+ `captcha` \<string>

验证码登陆

----

## `client.terminate()`

关闭连接

----

## APIs

从这里开始所有的api都为async函数，返回的是 `Promise`

值为以下格式的json对象：

```js
{
    retcode: 0,     //0成功 1异步状态未知 100参数错误 102失败
    status: "ok",   //ok或async或failed
    data: null,     //数据
    error: "",      //失败的时候偶尔会有这个字段
}
```

之后列出的返回值都在data内，其它字段不再列出

----

## `client.getFriendList([cache])`

+ `cache` \<boolean> Default: true
+ Returns: \<Map>
  + \<number, Object>

这里返回的不是数组，是一个ES6的Map对象，键是uin，值是json对象。  
对象内的字段可以参考[cqhttp](https://cqhttp.cc)文档。以下相同。  
另cqhttp是no_cache，这里是cache。

----

## `client.getGroupList([cache])`

+ `cache` \<boolean> Default: true
+ Returns: \<Map>
  + \<number, Object>

----

## `client.getGroupMemberList(group_id[,cache])`

+ `group_id` \<number>
+ `cache` \<boolean> Default: true
+ Returns: \<Map>
  + \<number, Object>

----

## `client.getGroupMemberInfo(group_id,user_id[,cache])`

+ `group_id` \<number>
+ `user_id` \<number>
+ `cache` \<boolean> Default: true
+ Returns: \<Map>
  + \<number, Object>

----

## `client.sendPrivateMsg(user_id,message[,auto_escape])`

+ `user_id` \<number>
+ `message` \<string|Array> 消息同样支持两种格式
+ `auto_escape` \<boolean> Default: false
+ Returns: `message_id` \<number>

----

## `client.sendGroupMsg(group_id,user_id,message[,auto_escape])`

+ `group_id` \<number>
+ `user_id` \<number>
+ `message` \<string|Array>
+ `auto_escape` \<boolean> Default: false
+ Returns: `message_id` \<number>

----
