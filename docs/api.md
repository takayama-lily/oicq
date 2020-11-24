# 请参照头文件 [client.d.ts](../client.d.ts)

----

# API

+ [启动-创建实例](#createClient(uin[,config]))
+ [系统类API](#系统类API)
+ [应用类API](#应用类API)
  + [获取列表和资料](#获取好友群群员列表和资料)
  + [发消息和撤回](#发消息和撤回)
  + [群操作](#群操作踢人禁言退群设置等)
  + [好友操作](#加群加好友删好友邀请好友点赞)
  + [设置状态和资料](#设置状态和资料)
  + [其他](#其他)

----

## `createClient(uin[,config])`

+ *`uin`* \<number>
+ *`config`* \<ConfBot>

创建一个client实例：

```js
const oicq = require("oicq");
const uin = 123456789, config = {};
const client = oicq.createClient(uin, config);
```

关于config请参考头文件中的 [ConfBot](../client.d.ts#ConfBot)

----

## 系统类API

### `client.login(password_md5)` 密码登陆

+ *`password_md5`* \<string|Buffer> md5后的密码，hex字符串或Buffer

### `client.captchaLogin(captcha)` 验证码登陆

+ *`captcha`* \<string> 4个字母

### `client.logout()` 安全下线

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

使用 [CQHTTP](https://github.com/howmanybots/onebot/blob/master/v11/specs/api/public.md) 风格的命名和参数。  

----

### 获取好友、群、群员列表和资料

+ `client.getFriendList()`
+ `client.getStrangerList()`
+ `client.getGroupList()`
+ async `client.getGroupMemberList(group_id[, no_cache])`
+ async `client.getGroupInfo(group_id[, no_cache])`
  + 返回值参照 [GroupInfo](../client.d.ts#GroupInfo)
+ async `client.getGroupMemberInfo(group_id, user_id[, no_cache])`
  + 返回值参照 [MemberInfo](../client.d.ts#MemberInfo)
+ async `client.getStrangerInfo(user_id[, no_cache])`
  + 返回值参照 [StrangerInfo](../client.d.ts#StrangerInfo)

----

### 发消息和撤回

message可以使用 `Array` 格式或 `String` 格式，支持CQ码  
参考 [消息段类型](https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md)

+ async `client.sendPrivateMsg(user_id, message[, auto_escape])` 
  + 返回值 *`message_id`* \<String>
+ async `client.sendGroupMsg(group_id, user_id, message[, auto_escape])`
  + 返回值 *`message_id`* \<String>
+ async `client.sendDiscussMsg(discuss_id, user_id, message[, auto_escape])`
+ async `client.deleteMsg(message_id)`

※ auto_escape参数：是否原样输出CQ码(既不解析)，默认false

----

### 处理申请和邀请

+ async `client.setFriendAddRequest(flag[, approve, remark, block])` block默认false
+ async `client.setGroupAddRequest(flag[, approve, reason, block])` block默认false

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
+ async `client.sendGroupPoke(group_id, user_id)`
+ async `client.setGroupAnonymous(group_id[, enable])`
+ async `client.setGroupWholeBan(group_id[, enable])`

----

### 加群加好友、删好友、邀请好友、点赞

+ async `client.addGroup(group_id[, comment])`
+ async `client.addFriend(group_id, user_id[, comment])`
+ async `client.deleteFriend(user_id[, block])` block默认true
+ async `client.inviteFriend(group_id, user_id)`
+ async `client.sendLike(user_id[, times])` times默认1，不能大于20

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

+ async `client.getCookies([domain])`
+ async `client.getCsrfToken()`
+ async `client.cleanCache([type])`
+ `client.canSendImage()`
+ `client.canSendRecord()`
+ `client.getStatus()` 该函数返回一些有用的统计信息
+ `client.getVersionInfo()`
+ `client.getLoginInfo()`

----

### 重载好友列表、群列表

注意：一旦调用，重载完成之前bot不接受其他任何请求，也不会上报任何事件

+ async `client.reloadFriendList()`
+ async `client.reloadGroupList()`
