# API

+ [createClient(uin[,config])](#createClient(uin[,config])))
+ [Class: Client](#Class-Client)
  + [系统类API](#系统类API)
    + [client.login(password_md5)](#client.login(password_md5))
    + [client.captchaLogin(captcha)](#client.captchaLogin(captcha))
    + [client.terminate()](#client.terminate())
  + [应用类API](#应用类API)
    + [获取列表](#获取好友群群员列表和info)
    + [发消息和撤回](#发私聊消息群消息)
    + [群操作](#群操作踢人禁言退群设置等)
    + [加好友](#加好友删好友邀请好友入群点赞)
    + [设置状态和资料](#设置状态和资料)
+ [setGlobalConfig(config)](#setGlobalConfig(config)-全局设置)

----

## `createClient(uin[,config])`

+ *`uin`* \<Number>
+ *`config`* \<JSON>

创建client一个实例：

```js
const oicq = require("oicq");
const uin = 123456789, config = {};
const client = oicq.createClient(uin, config);
```

默认config：

```js
{
    platform:       2,      //登陆类型 1手机 2平板 3手表(不支持部分群事件)
    log_level:      "info", //日志级别，有trace,debug,info,warn,error,fatal,off
    kickoff:        false,  //被挤下线是否在3秒后反挤
    ignore_self:    true,   //是否无视自己的消息(群聊、私聊)
    resend:         true,   //被风控时是否尝试用另一种方式强行发送
    data_dir:       //数据存储文件夹，需要可写权限，默认主目录下的data文件夹
}
```

----

## 系统类API

### `client.login(password_md5)` 密码登陆

+ *`password_md5`* \<string|Buffer> md5后的密码，hex字符串或Buffer

----

### `client.captchaLogin(captcha)` 验证码登陆

+ *`captcha`* \<string> 4个字母

----

### `client.logout()` 安全下线

----

### `client.terminate()` 直接关闭连接(不推荐使用)

----

## 应用类API

所有API都会返回以下格式的JSON对象，之后额外标注的返回值都是data中的字段

```js
{
    retcode: 0,     //0成功 1状态未知 100参数错误 102失败 103超时 104断线中
    status: "ok",   //ok或async或failed
    data: null,     //数据，只有获取列表以及发消息会返回message_id，其他时候为null
    error: {code: -1, message: ""}, //TX返回的错误代码和错误消息
}
```

使用 [CQHTTP](https://github.com/howmanybots/onebot/blob/master/v11/specs/api/public.md) 风格的命名和参数。同步函数会直接返回。异步函数标注为 `async` ，返回的是 `Promise`

----

### 获取好友、群、群员列表和info

+ `client.getFriendList()`
+ `client.getStrangerList()`
+ `client.getGroupList()`
+ async `client.getGroupMemberList(group_id)` 四个list函数返回的data是ES6的Map类型
+ async `client.getGroupInfo(group_id[, no_cache])` 获取群资料
  + *`group_id`* \<Number>
  + *`group_name`* \<String>
  + *`member_count`* \<Number>
  + *`max_member_count`* \<Number>
  + *`owner_id`* \<Number>
  + *`last_join_time`* \<Number>
  + *`last_sent_time`* \<Number>
  + *`shutup_time_whole`* \<Number> -1代表全员禁言中，0代表未禁言
  + *`shutup_time_me`* \<Number> 我的禁言到期时间
  + *`create_time`* \<Number>
  + *`grade`* \<Number>
  + *`max_admin_count`* \<Number>
  + *`active_member_count`* \<Number>
  + *`update_time`* \<Number> 当前群资料的最后更新时间
+ async `client.getGroupMemberInfo(group_id, user_id[, no_cache])` 获取群员资料
  + *`group_id`* \<Number>
  + *`user_id`* \<Number>
  + *`nickname`* \<String>
  + *`card`* \<String>
  + *`sex`* \<String>
  + *`age`* \<Number>
  + *`area`* \<String>
  + *`join_time`* \<Number>
  + *`last_sent_time`* \<Number>
  + *`level`* \<Number>
  + *`rank`* \<String>
  + *`role`* \<String>
  + *`title`* \<String>
  + *`title_expire_time`* \<Number>
  + *`shutup_time`* \<Number>
  + *`update_time`* \<Number> 此群员资料的最后更新时间
+ async `client.getStrangerInfo(user_id[, no_cache])` 获取陌生人资料
  + *`user_id`* \<Number>
  + *`nickname`* \<String>
  + *`sex`* \<String>
  + *`age`* \<Number>
  + *`area`* \<String>

----

### 发私聊消息、群消息

message可以使用 `Array` 格式或 `String` 格式，支持CQ码  
参考 [消息段类型](https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md)

+ async `client.sendPrivateMsg(user_id, message[, auto_escape])`
  + *`message_id`* \<String> 返回字符串格式的message_id
+ async `client.sendGroupMsg(group_id, user_id, message[, auto_escape])`
  + *`message_id`* \<String> 返回字符串格式的message_id
+ async `client.sendDiscussMsg(discuss_id, user_id, message[, auto_escape])`
+ async `client.deleteMsg(message_id)`

----

### 处理申请和邀请

+ async `client.setFriendAddRequest(flag[, approve, remark, block])` block默认是false
+ async `client.setGroupAddRequest(flag[, approve, reason, block])` block默认是false

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
+ async `client.sendGroupPoke(group_id, user_id)` 最近新增的戳一戳
+ async `client.setGroupAnonymous(group_id[, enable])`
+ async `client.setGroupWholeBan(group_id[, enable])`

----

### 加群加好友、删好友、邀请好友入群、点赞

+ async `client.addGroup(group_id[, comment])`
+ async `client.addFriend(group_id, user_id[, comment])`
+ async `client.deleteFriend(user_id[, block])` block默认是true
+ async `client.inviteFriend(group_id, user_id)`
+ async `client.sendLike(user_id[, times])` times默认为1，不能大于20

----

### 设置状态和资料

+ async `client.setOnlineStatus(status)` 设置在线状态，仅支持手机协议
  + `status` 允许的值：11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
+ async `client.setNickname(nickname)` 设置昵称
+ async `client.setGender(gender)` 0未知 1男 2女
+ async `client.setBirthday(birthday)` 20110202的形式
+ async `client.setDescription([description])` 设置个人说明
+ async `client.setSignature([signature])` 设置个性签名
+ async `client.setPortrait(file)` 设置个人头像(file为Buffer或图片CQ码中相同格式的字符串)
+ async `client.setGroupPortrait(group_id, file)` 设置群头像

----

### 其他

+ async `client.getCookies([domain])` 实验性质，更新可能存在问题
+ async `client.getCsrfToken()`
+ async `client.cleanCache([type])`

+ `client.canSendImage()`
+ `client.canSendRecord()`
+ `client.getStatus()`
+ `client.getVersionInfo()`
+ `client.getLoginInfo()`
