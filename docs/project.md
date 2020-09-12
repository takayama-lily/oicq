# 已支持和尚未支持的功能

* ◯已支持
* ✕尚未支持

----

|[消息]|文字和表情|长消息|图片|语音|合并转发|xml/json|
|-|-|-|-|-|-|-|
|好友|◯|◯|◯|✕|◯|✕|
|群聊|◯|◯|◯|◯|◯|✕|
|临时会话|◯|◯|◯|✕|◯|✕|

----

|[好友功能]|API|事件|
|-|-|-|
|好友列表|◯|◯(好友增减)|
|处理申请|◯|◯|
|撤回消息|◯|◯|

----

|[群功能]|API|事件|
|-|-|-|
|群列表|◯|◯(群增减)|
|成员列表|◯|◯(成员增减)|
|踢人|◯|◯|
|禁言|◯|◯|
|撤回|◯|◯|
|修改名片|◯|✕|
|修改群名|◯|◯|
|群公告|◯|◯|
|其他设置|✕|✕|
|群文件|✕|◯|
|设置头衔|◯|✕|
|设置管理|◯|◯|
|解散转让|✕|◯|
|退群|◯|◯|
|同意邀请|◯|◯|
|处理申请|◯|◯|

----

|[其它]||
|-|-|
|修改QQ状态|◯|

----

|[CQ码]|收|发|说明|
|-|-|-|-|
|at|◯|◯|[CQ:at,qq=123456,text=@ABC] text用来定义@不到时的输出|
|face|◯|◯|表情，[CQ:face,id=104]
|bface|◯|◯|原创表情，[CQ:bface,file=xxxxxxxx,text=摸头]|
|image|◯|◯|[CQ:image,file=xxxxxxxx,url=xxxxxxxx] 收到的图片<br>[CQ:image,file=C:/123.jpg] 本地图片<br>[CQ:image,cache=0,file=http://abc.com] 网络图片|
|record|◯|◯|发送语音，写法和image一样<br>支持任何格式的音频自动转amr(必须将 [ffmpeg](http://ffmpeg.org/download.html) 加入环境变量path)<br>linux下的ffmpeg不自带amr解码器，可能需要自行编译ffmpeg|
|flash|◯|◯|闪照，写法和image一样|
|file|◯|✕|群文件，[CQ:file,url=xxxxxx,size=123456,md5=xxxxxx,duration=0,name=xxxxxx]|
|music|✕|✕|
|video|✕|✕|
|location|◯|◯|[CQ:location,address=江西省九江市修水县,lat=29.063940,lng=114.339610]|
|reply|✕|✕|
|share|✕|✕|
|node|✕|◯|[CQ:node,uin=123456789,name=昵称,content=消息内容,time=时间戳]<br>time可省略，暂时只支持纯文本|
