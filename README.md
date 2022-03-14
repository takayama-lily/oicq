# oicq

[![npm version](https://img.shields.io/npm/v/oicq/latest.svg)](https://www.npmjs.com/package/oicq)
[![dm](https://shields.io/npm/dm/oicq)](https://www.npmjs.com/package/oicq)
[![node engine](https://img.shields.io/node/v/oicq/latest.svg)](https://nodejs.org)
[![discord](https://img.shields.io/static/v1?label=chat&message=on%20discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)

* QQ(安卓)协议基于Node.js的实现，支持最低node版本为 v14
* 若你不熟悉Node.js或不会组织代码，可通过 [template](https://github.com/takayama-lily/oicq-template) 创建一个简单的应用程序
* [API Reference](#api-reference) / [Type Docs](https://takayama-lily.github.io/oicq/) (文档仅供参考，具体类型以包内d.ts声明文件为准)
* [从v1.x升级](https://github.com/takayama-lily/oicq/projects/3#column-16638290) (v1在master分支)

----

**Install:**

```bash
> npm i oicq  # or > yarn add oicq
```

**Usage:**

```js
const { createClient } = require("oicq")
const account = 147258369
const client = createClient(account)

client.on("system.online", () => console.log("Logged in!"))
client.on("message", e => {
  console.log(e)
  e.reply("hello world", true) //true表示引用对方的消息
})

client.on("system.login.qrcode", function (e) {
  //扫码后按回车登录
  process.stdin.once("data", () => {
    this.login()
  })
}).login()
```

注意：第一次运行程序时，有可能扫描命令行中的二维码和图片中的二维码都会显示过期，只需要重新运行一次程序即可，后面不会出现这个问题。

## Api Reference

* [Class: Client](#class-client) 客户端
* [Class: Group](#class-group) 群
* [Class: User](#class-user) 用户
* [Class: Friend](#class-friend) 好友
* [Class: Member](#class-member) 群员
* [Class: Contactable](#class-contactable) 群和用户的基类
* [Class: Gfs](#class-gfs) 群文件系统
* [Class: Message](#class-message) 消息
* [Namespace: segment](#namespace-segment) 构造消息元素
* [使用密码登录](#使用密码登录)

### Class: Client

> 使用 createClient() 或 new Client 创建实例

| Method               | Description               |
| -------------------- | ------------------------- |
| login()              | 登录                        |
| logout()             | 登出                        |
| queryQrcodeResult()  | 获取扫码结果                   |
| submitSlider()       | 提交滑动验证码                   |
| sendSmsCode()        | 发短信                       |
| submitSmsCode()      | 提交短信验证码                   |
| pickGroup()          | [得到一个群对象](#class-group)   |
| pickFriend()         | [得到一个好友对象](#class-friend) |
| pickMember()         | [得到一个群员对象](#class-member) |
| pickUser()           | [得到一个用户对象](#class-user)   |
| pickDiscuss()        | 得到一个讨论组对象                 |
| setOnlineStatus()    | 设置在线状态                    |
| setNickname()        | 设置昵称                      |
| setGender()          | 设置性别                      |
| setBirthday()        | 设置生日                      |
| setDescription()     | 设置个人说明                    |
| setSignature()       | 设置个性签名                    |
| setAvatar()          | 设置头像                      |
| getRoamingStamp()    | 获取漫游表情                    |
| deleteStamp()        | 删除漫游表情                    |
| addClass()           | 添加好友分组                    |
| deleteClass()        | 删除好友分组                    |
| renameClass()        | 重命名好友分组                   |
| reloadFriendList()   | 重载好友列表                    |
| reloadStrangerList() | 重载陌生人列表                   |
| reloadGroupList()    | 重载群列表                     |
| reloadBlackList()    | 重载黑名单列表                   |
| getSystemMsg()       | 获取系统消息                    |
| getForwardMsg()      | 解析合并转发                    |
| makeForwardMsg()     | 制作合并转发                    |
| getVideoUrl()        | 获取视频地址                    |
| cleanCache()         | 清空缓存文件                    |

| Property  | Description |
| --------- | ----------- |
| uin       | 我的账号        |
| status    | 在线状态        |
| nickname  | 昵称          |
| sex       | 性别          |
| age       | 年龄          |
| fl        | 好友列表(Map)   |
| gl        | 群列表(Map)    |
| sl        | 陌生人列表(Map)  |
| gml       | 群员列表缓存(Map) |
| blacklist | 黑名单列表(Set)  |
| classes   | 好友分组(Map)   |
| stamp     | 漫游表情(Set))  |
| logger    | 日志记录器       |
| config    | 配置          |
| dir       | 本地存储路径      |
| stat      | 数据统计        |
| bkn       | csrf-token  |
| cookies   | cookies     |
| tiny_id   | 我的频道账号 |

| Event                  | Description |
| ---------------------- | ----------- |
| system.login.qrcode    | 收到二维码       |
| system.login.slider    | 滑动验证码       |
| system.login.device    | 设备锁         |
| system.login.error     | 登录错误        |
| system.online          | 上线          |
| system.offline.kickoff | 服务器踢下线      |
| system.offline.network | 网络错误导致下线    |
| request.friend         | 好友申请        |
| request.group.add      | 加群申请        |
| request.group.invite   | 群邀请         |
| request                | 全部请求        |
| message.group          | 群消息         |
| message.private        | 私聊消息        |
| message.discuss        | 讨论组消息       |
| message                | 全部消息        |
| notice.friend.increase | 好友增加        |
| notice.friend.decrease | 好友减少        |
| notice.friend.recall   | 好友撤回        |
| notice.friend.poke     | 好友戳一戳       |
| notice.friend          | 好友通知        |
| notice.group.increase  | 群员增加        |
| notice.group.decrease  | 群员减少        |
| notice.group.recall    | 群撤回         |
| notice.group.poke      | 群戳一戳        |
| notice.group.ban       | 群禁言         |
| notice.group.admin     | 群管理变更       |
| notice.group.transfer  | 群转让         |
| notice.group           | 群通知         |
| notice                 | 全部通知        |
| sync.message           | 私聊消息同步      |
| sync.read              | 已读同步        |
| guild.message          | 频道消息        |

### Class: Group

> 群。 `notice.group` 和 `message.group` 相关事件中含有此实例 ( `e.group` 访问)  
> 或者使用 `client.pickGroup()` 获得群实例

| Method              | Description                |
| ------------------- | -------------------------- |
| sendMsg()           | 发送消息                       |
| recallMsg()         | 撤回消息                       |
| setName()           | 设置群名                       |
| setAvatar()         | 设置群头像                      |
| muteAll()           | 禁言全员                       |
| muteMember()        | 禁言群员                       |
| muteAnony()         | 禁言匿名者                      |
| kickMember()        | 踢人                         |
| pokeMember()        | 戳一戳                        |
| setCard()           | 设置名片                       |
| setAdmin()          | 设置管理员                      |
| setTitle()          | 设置头衔                       |
| invite()            | 邀请好友                       |
| quit()              | 退群/解散                      |
| getAnonyInfo()      | 获取匿名身份                     |
| allowAnony()        | 允许/禁止匿名                    |
| getChatHistory()    | 获取聊天记录                     |
| markRead()          | 标记已读                       |
| getFileUrl()        | 获取群文件下载地址                  |
| shareMusic()        | 分享音乐                       |
| getMemberMap()      | 获取群员列表                     |
| getAvatarUrl()      | 获取群头像地址                    |
| pickMember()        | [获取一个群成员对象](#class-member) |
| getAtAllRemainder() | 获取@全体剩余次数                  |
| renew()             | 刷新群资料                      |

| Property  | Description         |
| --------- | ------------------- |
| group_id  | 群号                  |
| name      | 群名                  |
| info      | 群资料                 |
| is_owner  | 我是否群主               |
| is_admin  | 我是否管理               |
| all_muted | 是否全员禁言              |
| mute_left | 我的禁言剩余时间            |
| fs        | [群文件系统](#class-gfs) |

### Class: User

| Method           | Description                  |
| ---------------- | ---------------------------- |
| sendMsg()        | 发送消息                         |
| recallMsg()      | 撤回消息                         |
| getSimpleInfo()  | 查询资料                         |
| getChatHistory() | 获取聊天记录                       |
| markRead()       | 标记已读                         |
| getFileUrl()     | 获取离线文件下载地址                   |
| getAvatarUrl()   | 获取头像地址                       |
| asFriend()       | [获取作为好友的对象](#class-friend)   |
| asMember()       | [获取作为某群群员的对象](#class-member) |
| addFriendBack()  | 回添双向好友                       |
| setFriendReq()   | 同意好友申请                       |
| setGroupReq()    | 同意加群申请                       |
| setGroupInvite() | 同意群邀请                        |

| Property | Description |
| -------- | ----------- |
| user_id  | QQ号         |

### Class: Friend

> 好友。继承 [User](#class-user) 的所有方法和属性  
> `notice.friend` 和 `message.private` 相关事件中含有此实例 ( `e.friend` 访问)  
> 或者使用 `client.pickFriend()` 获得好友实例

| Method       | Description |
| ------------ | ----------- |
| shareMusic() | 分享音乐        |
| setRemark()  | 设置备注        |
| setClass()   | 设置分组        |
| thumbUp()    | 点赞          |
| poke()       | 戳一戳         |
| delete()     | 删除          |

| Property   | Description |
| ---------- | ----------- |
| nickname   | 昵称          |
| sex        | 性别          |
| remark     | 备注          |
| class_id   | 分组id        |
| class_name | 分组名         |
| info       | 好友资料        |

### Class: Member

> 群成员。继承 [User](#class-user) 的所有方法和属性  
> `message.group` 相关事件中含有此实例 ( `e.member` 访问)  
> 或者使用 `client.pickMember()` 获得群成员实例

| Method      | Description |
| ----------- | ----------- |
| setAdmin()  | 设置管理        |
| setTitle()  | 设置头衔        |
| setCard()   | 设置名片        |
| kick()      | 踢群          |
| mute()      | 禁言          |
| poke()      | 戳一戳         |
| addFriend() | 加为好友        |
| renew()     | 更新群员资料      |

| Property  | Description           |
| --------- | --------------------- |
| group_id  | 群号                    |
| card      | 名片或昵称                 |
| title     | 头衔                    |
| is_friend | 是否好友                  |
| is_owner  | 是否群主                  |
| is_admin  | 是否管理                  |
| mute_left | 禁言剩余时间                |
| group     | [所在群对象](#class-group) |
| info      | 群员资料                  |

### Class: Contactable

> 抽象类，用户和群的基类，里面的方法和属性都会被继承

| Method           | Description  |
| ---------------- | ------------ |
| uploadImages()   | 上传一批图片以备发送   |
| uploadVideo()    | 上传一个视频以备发送   |
| uploadPtt()      | 上传一个语音以备发送   |
| makeForwardMsg() | 制作合并转发消息以备发送 |
| getForwardMsg()  | 解析合并转发消息     |
| getVideoUrl()    | 获取视频下载地址     |

| Property | Description |
| -------- | ----------- |
| client   | [所在客户端对象](#class-client)     |

### Class: Gfs

> 群文件系统，通过 `group.fs` 获取

| Method     | Description |
| ---------- | ----------- |
| df()       | 查询使用空间      |
| stat()     | 获取文件或目录属性   |
| dir()      | 列出文件和目录     |
| ls()       | dir的别名      |
| mkdir()    | 创建目录        |
| rm()       | 删除文件或目录     |
| rename()   | 重命名文件或目录    |
| mv()       | 移动文件        |
| upload()   | 上传文件        |
| download() | 获取下载链接      |

| Property | Description           |
| -------- | --------------------- |
| group_id | 群号                    |
| group    | [所在群对象](#class-group) |
| client   | [所在客户端对象](#class-client)               |

### Class: Message

> 拥有子类: `PrivateMessage`, `GroupMessage`, `DiscussMessage`  
> 对应的消息事件中含有这些实例中的一个

| Method      | Description |
| ----------- | ----------- |
| serialize() | 序列化一条消息     |
| toString()  | 一种适合阅读的形式   |

| Static Method | Description |
| ------------- | ----------- |
| deserialize() | 反序列化一条消息    |

| Property     | Description |
| ------------ | ----------- |
| message_type | 消息类别：群或私聊   |
| sub_type     | 子类别         |
| group_id     | 群号          |
| from_id      | 发送者         |
| to_id        | 接收者         |
| anonymous    | 匿名者信息       |
| auto_reply   | 是否自动回复      |
| block        | 是否屏蔽        |
| atme         | 是否atme      |
| atall        | 是否atall     |
| message      | 消息链         |
| raw_message  | 消息摘要        |
| sender       | 发送者         |
| time         | 消息时间        |
| seq          | 消息序号        |
| rand         | 消息随机数       |
| font         | 字体          |
| source       | 引用回复的消息     |

### Namespace: segment

> 用于创建可发送的消息元素类型  
> `const { segment } = require("oicq")`

| Method     | Description |
| ---------- | ----------- |
| at()       | 创建at元素      |
| face()     | 创建表情元素      |
| image()    | 创建图片元素      |
| flash()    | 创建闪照元素      |
| video()    | 创建视频元素      |
| record()   | 创建语音元素      |
| xml()      | 创建xml元素     |
| json()     | 创建json元素    |
| share()    | 创建链接分享元素    |
| location() | 创建地点分享元素    |
| poke()     | 创建戳一戳元素     |
| bface()    | 创建bface元素   |
| sface()    | 创建sface元素   |
| mirai()    | 创建特殊元素      |

### 使用密码登录

首次登录推荐使用扫码，但是可能会出现掉线后需要重新扫码的情况。  
登录一段时间后，不会再弹出滑动验证码，此时建议改用密码登录，更加稳定。

```js
const { createClient } = require("oicq")
const client = createClient(147258369)

//若弹出登录保护地址，去验证通过即可
client.login("password")
```

----

**其他：**

* [QQWebApi](./web-api.md) QQ Web Api 收集整理 (途中)
* [码云镜像仓库](https://gitee.com/takayama/oicq)
* [赞助记录](./sponsors.md) 想赞助可加群给我发红包

[![group:236172566](https://img.shields.io/badge/group-236172566-blue)](https://qm.qq.com/cgi-bin/qm/qr?k=NXw3NEA5lzPjkRhyEpjVBqMpdg1WHRKJ&jump_from=webapi)
