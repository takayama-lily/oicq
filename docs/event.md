# 事件

一级事件共有以下四类

+ [Event: system](#Event-system) 系统类(如上下线、验证码、设备锁等)
+ [Event: message](#Event-message) 聊天消息类
+ [Event: request](#Event-request) 请求类
+ [Event: notice](#Event-notice) 通知类

----

实例化client后，使用 `client.on()` 来监听一个事件：

```js
client.on("system.login.captcha", (data)=>console.log(data)); //监听登陆时的验证码事件
client.on("message", (data)=>console.log(data)); //监听所有的消息事件
client.on("message.group", (data)=>console.log(data)); //监听群消息事件
client.on("request", (data)=>console.log(data)); //监听所有的请求事件
client.on("notice", (data)=>console.log(data)); //监听所有的通知事件
```

事件为冒泡传递，例如 `request.group.add` 事件，若未监听会沿着二级分类 `request.group` 传递到一级分类 `request`  
事件使用cqhttp风格命名和参数，所有事件数据都为json对象，并包含以下共通字段：

+ `post_type` 一级分类 system, message, request, notice
+ `{post_type}_type` 二级分类 如：login, online, offline, group, friend, private 等
+ `sub_type` 三级分类 如：captcha, add, invite 等，有时会没有
+ `self_id` bot自己的号码
+ `time` unix时间戳

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
    + *`code`* 错误码

+ `system.online` 上线事件，可以开始处理消息

+ `system.offline` 下线事件
  + `system.offline.network` 网络断开，可以过几秒后尝试重新login
  + `system.offline.frozen` 被冻结
  + `system.offline.kickoff` 另一处登陆
  + `system.offline.device` 由于开启设备锁，需要重新验证
  + `system.offline.unknown` 其他，可以过几秒后尝试重新login
    + *`message`* 下线原因(string)

----

以下事件使用 [CQHTTP](https://github.com/howmanybots/onebot/blob/master/v11/specs/event/README.md) 风格的命名和字段

## Event: `message`

+ **message.private**

  + `message.private.friend` 好友消息
  + `message.private.single` 单向好友消息
  + `message.private.group` 群临时会话
  + `message.private.other` 其他临时会话
    + *`message_id`*
    + *`user_id`*
    + *`font`*
    + *`message`* 数组格式的消息
    + *`raw_message`* 字符串格式的消息(CQ码已转义)
    + *`sender`*
      + *`user_id`*
      + *`nickname`*
      + *`remark`*
      + *`sex`*
      + *`age`*
      + *`area`*
    + *`auto_reply`* 是否是自动回复(boolean)

+ **message.group**

  + `message.group.normal` 群普通消息
  + `message.group.anonymous` 群匿名消息
    + *`message_id`*
    + *`group_id`*
    + *`group_name`*
    + *`user_id`*
    + *`anonymous`* 非匿名消息时为null
      + *`id`*
      + *`name`*
      + *`flag`*
    + *`font`*
    + *`message`*
    + *`raw_message`*
    + *`sender`*
      + *`user_id`*
      + *`nickname`*
      + *`card`*
      + *`sex`*
      + *`age`*
      + *`area`*
      + *`level`*
      + *`role`*
      + *`title`*
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
    + *`comment`* 附加信息
    + *`sex`*
    + *`age`*
    + *`flag`* 用于处理请求时传入

+ **request.group**

  + `request.group.add` 加群申请
    + *`group_id`*
    + *`group_name`*
    + *`user_id`*
    + *`nickname`*
    + *`comment`*
    + *`flag`*

  + `request.group.invite` 加群邀请
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
    + *`nickname`*
    + *`signature`*

+ **notice.group**

  + `notice.group.increase` 群员增加
    + *`group_id`*
    + *`user_id`*
    + *`nickname`*

  + `notice.group.decrease` 群员减少
    + *`group_id`*
    + *`operator_id`*
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
    + *`user_id`* 匿名用户为80000000
    + *`nickname`* 匿名用户才有这个字段
    + *`duration`* 时间(0为解禁)

  + `notice.group.transfer` 群转让事件
    + *`group_id`*
    + *`operator_id`* 旧群主
    + *`user_id`* 新群主

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
