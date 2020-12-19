# message_id的规则和解析方法

发送和接收到消息都可以得到一个消息ID。  
由于core中不使用数据库，所以将一些可能使用到的数据存入消息id以统一和简化API。  

## 群消息id规则

```md
群消息id总共21字节，使用base64编码保存

| 群号(int32) | 发送者QQ(int32) | 消息编号(int32) | 随机数(int32) | 时间戳(int32) | 分片数(int8) |
      gid           uid              seqid           random         timestamp       pktnum
```

## 私聊消息id规则

```md
私聊消息id总共16字节，使用base64编码保存

| 对方QQ(int32) | 消息编号(int32) | 随机数(int32) | 时间戳(int32) |
      uid             seqid           random        timestamp
```

## 解析消息id

```js
var parsed = Buffer.from(message_id, "base64");
var gid = parsed.readUInt32BE(parsed);
var uid = parsed.readUInt32BE(parsed, 4);
var seqid = parsed.readUInt32BE(parsed, 8);
```

目前使用到消息id的地方：

* deleteMsg (撤回消息)
* getMsg (获取历史消息)
* [CQ:reply] (回复)
* [CQ:node] (转发)

> 一般对于群来说，seqid由服务器管理，不会重复。  
> 私聊的seqid非服务器管理，可能会重复。  
