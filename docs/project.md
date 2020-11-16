# 已支持和尚未支持的功能

* ◯已支持
* ✕尚未支持

----

|[消息]|文字和表情|长消息|图片|语音|合并转发|分享|匿名|
|-|-|-|-|-|-|-|-|
|好友|◯|◯|◯|◯|<s>◯</s>|◯||
|群聊|◯|◯|◯|◯|<s>◯</s>|◯|◯|
|讨论组|◯|◯|◯|◯|<s>◯</s>|||
|临时会话|◯|◯|◯|||||

----

|[好友功能]|API|事件|
|-|-|-|
|好友列表|◯|◯(好友增减)|
|陌生人列表|◯||
|处理申请|◯|◯|
|撤回消息|◯|◯|
|点赞|◯||
|加群员好友|◯||
|删除好友|◯|◯|


----

|[群功能]|API|事件|
|-|-|-|
|群列表|◯|◯(群增减)|
|成员列表|◯|◯(成员增减)|
|踢人|◯|◯|
|禁言|◯|◯|
|撤回|◯|◯|
|修改名片|◯||
|修改群名|◯|◯|
|群公告|◯|◯|
|其他设置|✕|◯|
|群文件|✕|◯|
|设置头衔|◯|◯|
|设置管理|◯|◯|
|创建|✕|✕|
|转让|✕|◯|
|解散|◯|◯|
|退群|◯|◯|
|群邀请|◯|◯|
|群申请|◯|◯|
|邀请好友|◯||
|添加群|◯||

----

|[个人]||
|-|-|
|设置QQ状态|◯|
|修改昵称|◯|
|修改性别|◯|
|修改生日|◯|
|修改个人说明|◯|
|修改签名|◯|
|修改头像|◯|
|获取cookies|◯|

----

## 什么是CQ码？

CQ码是指字符串格式下用于表示多媒体内容的方式，形如：  
`[CQ:image,file=123.jpg]`  
`[CQ:at,qq=123456]`  
常用的有at、表情、图片、语音、音乐、分享等。  
因此混在字符串中的CQ码，以下字符会被转义：`[]&,`
推荐使用数组格式的消息链，可以避免转义操作。

|[CQ码]|收|发|说明|
|-|-|-|-|
|at|◯|◯|[CQ:at,qq=123456,text=@ABC,dummy=0]<br>text用来定义@不到时的输出<br>dummy设为1可以假@|
|face|◯|◯|[CQ:face,id=104]|
|bface|◯|◯|原创表情，[CQ:bface,file=xxxxxxxx,text=摸头]|
|dice&rps|◯|◯|骰子和猜拳：<br>[CQ:dice,id=1]<br>[CQ:rps,id=1]|
|image|◯|◯|参考 [图片](https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md#%E5%9B%BE%E7%89%87)|
|record|◯|◯|语音，写法同image<br>支持任何格式的音频自动转amr(必须将 [ffmpeg](http://ffmpeg.org/download.html) 加入环境变量path)<br>linux下的ffmpeg不自带amr解码器，可能需要自行编译ffmpeg|
|flash|◯|◯|闪照，写法同image|
|anonymous||◯|发匿名，[CQ:anonymous,ignore=1]<br>ignore可省略，为0时匿名失败不发送|
|notice|◯||群公告|
|file|◯||群文件|
|music|◯|◯|[CQ:music,type=qq,id=xxxxxx]<br>[CQ:music,type=163,id=xxxxxx]|
|video|✕|✕|
|location|◯|◯|[CQ:location,address=江西省九江市修水县,lat=29.063940,lng=114.339610]|
|contact|◯|✕|联系人或群推荐
|reply|◯|◯|[CQ:reply,id=xxxxxx]
|share|◯|◯|链接分享
|<s>node</s>|✕|◯|<s>[CQ:node,uin=123456789,name=昵称,content=消息内容,time=时间戳]<br>time可省略，暂时只支持纯文本/s>|
