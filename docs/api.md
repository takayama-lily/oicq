# API和事件

+ [oicq.createClient(uin[,config])](#oicq.createClient(uin[,config]))
+ [Class: oicq.Client](#Class-Client)
  + [Events](#Events)
    + [Event: system](#Event-system)
    + [Event: message](#Event-message)
    + [Event: request](#Event-request)
    + [Event: notice](#Event-notice)
  + [client.login(password_md5)](#client.login(password_md5))
  + [client.captchaLogin(captcha)](#client.captchaLogin(captcha))
  + [client.terminate()](#client.terminate())
  + [APIs](#APIs)
    + [获取列表](#获取好友群群员列表和info)
    + [发消息和撤回](#发私聊消息群消息)
    + [群操作](#群操作踢人禁言退群设置等)
    + [加好友](#加好友删好友邀请好友入群点赞)
    + [设置状态和资料](#设置状态和资料)
+ [oicq.setGlobalConfig(config)](#oicq.setGlobalConfig(config))

----

## `oicq.createClient(uin[,config])`

+ `uin` \<number>
+ `config` \<Object>

创建client一个实例：

```js
const oicq = require("oicq");
const uin = 123456789, config = {};
const client = oicq.createClient(uin, config);
```

config说明：

```js
//要使用默认配置请勿传递该字段
const config = {
    platform:       2,      //登陆类型 1手机 2平板 3手表(不支持部分群事件)
    log_level:      "info", //日志级别，有trace,debug,info,warn,error,fatal,off
    kickoff:        false,  //被挤下线是否在3秒后反挤对方
    ignore_self:    true,   //群聊是否无视自己的发言
};
```

----

## Events

使用 `client.on()` 来监听一个事件：

```js
client.on("system.login.captcha", (data)=>{
    console.log(data);
});
```

事件为冒泡传递，例如 `request.group.add` 事件，若未监听会沿着二级分类 `request.group` 传递到一级分类 `request`  
事件使用cqhttp风格命名和参数，所有事件数据都为json对象，并包含以下共通字段：

+ `self_id`
+ `time`
+ `post_type` 一级分类 system, message, request, notice
+ `{post_type}_type` 二级分类 如：login, online, offline, group, friend, private 等
+ `sub_type` 三级分类 如：captcha, add, invite 等，有时会没有

之后只列出其他非共通的字段。

----

## Event: `system`

+ `system.login`
  + `system.login.captcha` 收到验证码
    + *`image`* 图片数据(Buffer)
  + `system.login.device` 需要解设备锁
    + *`url`* 设备锁验证地址(string)
  + `system.login.error` 其他原因导致登陆失败
    + *`message`* "密码错误"等(string)

+ `system.online` 上线事件，可以开始处理消息

+ `system.offline` 下线事件
  + `system.offline.network` 网络断开
  + `system.offline.frozen` 被冻结
  + `system.offline.kickoff` 另一处登陆
  + `system.offline.device` 由于开启设备锁，需要重新验证
  + `system.offline.unknown` 未知

----

以下事件使用 [CQHTTP](https://github.com/howmanybots/onebot/blob/master/v11/specs/event/README.md) 风格的命名和字段

## Event: `message`

+ **message.private**

  + `message.private.friend` 好友消息
  + `message.private.single` 单向好友消息
  + `message.private.group` 群临时会话
  + `message.private.other` 其他临时会话
    + *`message_id`* string型
    + *`user_id`* 对方QQ号(number)
    + *`font`* 字体名称，如："微软雅黑"
    + *`message`* 数组格式的消息
    + *`raw_message`* 字符串格式的消息(CQ码已转义)
    + *`sender`*
      + *`user_id`*
      + *`nickname`* 昵称
      + *`remark`* 备注
      + *`sex`* "male"或"female"或"unknown"
      + *`age`* 年龄(number)

+ **message.group**

  + `message.group.normal` 群消息
  + `message.group.anonymous` 群匿名消息
    + *`message_id`* string型
    + *`group_id`* 群号(number)
    + *`group_name`* 群名(string)
    + *`user_id`* 对方QQ号(number)
    + *`anonymous`* 非匿名消息时为null
      + *`id`* 暂时为0
      + *`name`* 匿名者的名字
      + *`flag`* 暂时为空
    + *`font`* 字体名称，如："微软雅黑"
    + *`message`* 数组格式的消息
    + *`raw_message`* 字符串格式的消息(CQ码已转义)
    + *`sender`*
      + *`user_id`*
      + *`nickname`* 昵称
      + *`card`* 群名片
      + *`sex`* "male"或"female"或"unknown"
      + *`age`* 年龄(number)
      + *`area`* 暂时为"unknown"
      + *`level`* 群等级(number)
      + *`role`* "owner"或"admin"或"member"
      + *`title`* 群头衔(string)
  + `message.discuss` 讨论组消息
    + *`discuss_id`*
    + *`discuss_name`*
    + *`user_id`*
    + *`font`*
    + *`message`*
    + *`raw_message`*
    + *`sender`*
      + *`user_id`*
      + *`nickname`*
      + *`card`*

----

## Event: `request`

+ **request.friend**

  + `request.friend.add` 好友请求
    + *`user_id`*
    + *`nickname`*
    + *`source`* 来源("QQ群-xxx"或"QQ查找"等)
    + *`comment`*
    + *`sex`*
    + *`age`*
    + *`flag`* 用于处理请求时传入(string)

+ **request.group**

  + `request.group.add` 收到加群请求
    + *`group_id`*
    + *`group_name`*
    + *`user_id`*
    + *`nickname`*
    + *`comment`*
    + *`flag`*

  + `request.group.invite` 收到加群邀请
    + *`group_id`*
    + *`group_name`*
    + *`user_id`*
    + *`nickname`*
    + *`role`* 邀请者的权限("admin"或"member")
    + *`flag`*

----

## Event: `notice`

为了统一风格，notice事件的命名和原版cqhttp有一定出入

+ **notice.friend**

  + `notice.friend.increase` 好友增加
    + *`user_id`*
    + *`nickname`*

  + `notice.friend.decrease` 好友减少(被拉黑或自己删除都会触发)
    + *`user_id`*
    + *`nickname`*

  + `notice.friend.recall` 消息撤回事件
    + *`user_id`*
    + *`message_id`*

  + `notice.friend.profile` 好友资料变更
    + *`user_id`*
    + *`nickname`* 昵称
    + *`signature`* 签名

+ **notice.group**

  + `notice.group.increase` 群员增加
    + *`group_id`*
    + *`user_id`*
    + *`nickname`*

  + `notice.group.decrease` 群员减少
    + *`group_id`*
    + *`operator_id`* 操作者，自己退群的时候和user_id相同
    + *`user_id`*
    + *`dismiss`* 是否是解散(boolean型)

  + `notice.group.recall` 群消息撤回事件
    + *`group_id`*
    + *`operator_id`*
    + *`user_id`*
    + *`message_id`*

  + `notice.group.admin` 管理变更事件
    + *`group_id`*
    + *`user_id`*
    + *`set`* boolean型

  + `notice.group.ban` 群禁言事件
    + *`group_id`*
    + *`operator_id`*
    + *`user_id`*
    + *`duration`* 时间(0为解禁)

  + `notice.group.transfer` 群转让事件
    + *`group_id`*
    + *`operator_id`* 旧群主
    + *`user_id`* 新群主

  + `notice.group.notice` 收到群公告
    + *`group_id`*
    + *`user_id`*
    + *`sender`*
    + *`title`*
    + *`content`*

  + `notice.group.file` 收到群文件
    + *`group_id`*
    + *`user_id`*
    + *`sender`*
    + *`file`*
      + *`name`*
      + *`url`*
      + *`size`*
      + *`md5`*
      + *`duration`*

  + `notice.group.title` 群头衔变更事件
    + *`group_id`*
    + *`user_id`*
    + *`nickname`*
    + *`title`*

  + `notice.group.poke` 群戳一戳事件
    + *`group_id`*
    + *`operator_id`* 操作者
    + *`user_id`* 目标
    + *`action`* 动作名
    + *`suffix`* 动作后缀

  + `notice.group.setting` 群设置变更事件，以下带有enable的字段都为 `boolean`
    + *`enable_guest`* 允许游客进入
    + *`enable_anonymous`* 允许匿名
    + *`enable_upload_album`* 允许群员上传相册
    + *`enable_upload_file`* 允许群员上传文件
    + *`enable_temp_chat`* 允许临时会话
    + *`enable_new_group`* 允许发起新群聊
    + *`enable_show_honor`* 展示群互动标识(龙王等)
    + *`enable_show_level`* 展示群等级
    + *`enable_show_title`* 展示群头衔
    + *`enable_confess`* 开启坦白说
    + *`group_name`* 群名也是变更对象
    + *`group_id`*
    + *`user_id`* 操作者不明的时候为 -1

----

## 系统类API

## `client.login(password_md5)` 密码登陆

+ `password_md5` \<string|Buffer> md5后的密码，hex字符串或Buffer

----

## `client.captchaLogin(captcha)` 验证码登陆

+ `captcha` \<string> 4个字母

----

## `client.terminate()` 关闭连接

----

## APIs

(使用 [CQHTTP](https://github.com/howmanybots/onebot/blob/master/v11/specs/api/public.md) 风格的命名和参数)

同步函数会直接返回。异步函数标注为 `async` ，返回的是 `Promise` ，返回值为以下格式的json对象：

```js
{
    retcode: 0,     //0成功 1状态未知 100参数错误 102失败 103超时
    status: "ok",   //ok或async或failed
    data: null,     //数据，只有获取列表以及发消息会返回message_id，其他API为null
    error: "",      //错误代码和错误消息，暂未完全实现
}
```

函数为驼峰命名，转换成下划线就是cqhttp的api，参数完全相同

----

### 获取好友、群、群员列表和info

+ `client.getFriendList()`
+ `client.getStrangerList()`
+ `client.getGroupList()`
+ async `client.getGroupMemberList(group_id)`
  + 获取列表返回的是ES6的Map类型，不是数组
+ async `client.getGroupInfo(group_id[, no_cache])`
+ async `client.getGroupMemberInfo(group_id, user_id[, no_cache])`
+ async `client.getStrangerInfo(user_id[, no_cache])`

----

### 发私聊消息、群消息

message可以使用 `Array` 格式或 `String` 格式，支持CQ码

+ async `client.sendPrivateMsg(user_id, message[, auto_escape])` 返回message_id
+ async `client.sendGroupMsg(group_id, user_id, message[, auto_escape])` 返回message_id
+ async `client.sendDiscussMsg(discuss_id, user_id, message[, auto_escape])` 讨论组无message_id
+ async `client.deleteMsg(message_id)`
  + `message_id` 现在是字符串，保存了所有撤回时需要用到的数据

----

### 处理申请和邀请

+ async `client.setFriendAddRequest(flag[, approve, remark, block])`
+ async `client.setGroupAddRequest(flag[, approve, reason, block])`
  + block字段表示是否拉黑，默认false

----

### 群操作(踢人、禁言、退群、设置等)

+ async `client.setGroupKick(group_id, user_id[, reject_add_request])`
+ async `client.setGroupBan(group_id, user_id[, duration])`
+ async `client.setGroupLeave(group_id[, is_dismiss])`
+ async `client.setGroupCard(group_id, user_id[, card])`
+ async `client.setGroupName(group_id, group_name)`
+ async `client.setGroupAdmin(group_id, user_id[, enable])`
+ async `client.setGroupSpecialTitle(group_id, user_id[, special_title, duration])`
+ async `client.sendGroupNotice(group_id, content)`
+ async `client.sendGroupPoke(group_id, user_id)` 戳一戳

----

### 加群加好友、删好友、邀请好友入群、点赞

+ async `client.addGroup(group_id)`
+ async `client.addFriend(group_id, user_id[, comment])`
+ async `client.deleteFriend(user_id[, block])` block(屏蔽)默认是true
+ async `client.inviteFriend(group_id, user_id)`
+ async `client.sendLike(user_id[, times])` times默认为1，不能大于20

----

### 设置状态和资料

+ async `client.setOnlineStatus(status)` 仅支持手机协议
  + `status` 允许的值：11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
+ async `client.setNickname(nickname)` 设置昵称
+ async `client.setGender(gender)` 0未知 1男 2女
+ async `client.setBirthday(birthday)` 20110202的形式
+ async `client.setDescription([description])` 设置个人说明
+ async `client.setSignature([signature])` 设置个性签名

----

### 其他

+ `client.canSendImage()`
+ `client.canSendRecord()`
+ `client.getStatus()`
+ `client.getVersionInfo()`
+ `client.getLoginInfo()`

----

## oicq.setGlobalConfig(config)

+ `config` \<Object>

全局设置

```js
//要使用默认配置请勿传递该字段
oicq.setGlobalConfig({
    web_image_timeout:  0,  //下载网络图片的超时时间(0表示系统自己判断)
    web_record_timeout: 0,  //下载网络语音的超时时间
    cache_root:         "", //缓存文件夹根目录，需要可写权限,默认主目录下的data文件夹
    debug: false,
});
```

----