# QQ Web Api 收集

web api 是需要 cookie 或 csrf-token(bkn) 才可正常访问，用于实现一些扩展功能的 api  
如果你知道一些尚未收集到的有用api，欢迎提交pr到这个文件

----

**使用oicq客户端登录后获取cookie和csrf-token:**

```js
let domain = ""; //支持qun.qq.com等多个domain
const cookie = client.cookies[domain];
const bkn = client.bkn;
// cookie需要设置在http请求头部
```

|Name|Method|Url|Cookie|Domain|
|-|-|-|-|-|
|取QQ等级|GET|`https://club.vip.qq.com/api/vip/getQQLevelInfo?requestBody={"iUin":${QQ号}}`|YES|`vip.qq.com`
|取群资料|GET|`https://qinfo.clt.qq.com/cgi-bin/qun_info/get_group_info_all?gc=${群号}&bkn=${bkn}`<br>*※陌生群也可以获取*|YES|空
|取群设置|GET|`https://qinfo.clt.qq.com/cgi-bin/qun_info/get_group_setting_v2?gc=${群号}&bkn=${bkn}`<br>*※必须是群员*|YES|空
|取群成员|GET|`https://qinfo.clt.qq.com/cgi-bin/qun_info/get_group_members_new?gc=${群号}&bkn=${bkn}`<br>*※必须是群员*|YES|空
|取群操作记录|GET|`https://qinfo.clt.qq.com/cgi-bin/qun_info/get_sys_msg?gc=${群号}&bkn=${bkn}`<br>*※必须是管理员*|YES|空
|取QQ资料|GET|`https://cgi.find.qq.com/qqfind/buddy/search_v3?keyword=${QQ号}`|YES|空
|开关匿名|GET|`https://qqweb.qq.com/c/anonymoustalk/set_anony_switch?bkn=${bkn}&value=${1或0}&group_code=${群号}`|YES|`qqweb.qq.com`
|取群荣誉|GET|`https://qun.qq.com/interactive/qunhonor?gc=${群号}`|YES|`qun.qq.com`
|精华消息|GET|`https://qun.qq.com/cgi-bin/group_digest/digest_list?bkn=${bkn}&group_code=${群号}&page_start=${页数}&page_limit=${每页数量}`<br>*※必须是群成员，每页的数量不能超过50*|YES|`qun.qq.com`
|取群公告|GET|`https://web.qun.qq.com/cgi-bin/announce/get_t_list?bkn=${bkn}&qid=${群号}&ft=23&s=-1&n=20`|YES|`qun.qq.com`|
|发群公告|POST|`https://web.qun.qq.com/cgi-bin/announce/add_qun_notice?bkn=${bkn}`<br>POST数据：`qid=${群号}&bkn=${bkn}&text=${内容}&pinned=0&type=1&settings={"is_show_edit_card":1,"tip_window_type":1,"confirm_required":1}`|YES|`qun.qq.com`
|取群成员|GET|`https://qun.qq.com/cgi-bin/qun_mgr/search_group_members?gc=${群号}&st=${0}%end=${20}&sort=0&bkn=${bkn}`|YES|`qun.qq.com`|
|取群头像|GET|`https://p.qlogo.cn/gh/${群号}/${群号}/${0(size)}`|NO||
|取群历史头像|GET|`https://p.qlogo.cn/gh/${群号}/${群号}_${1}/${0(size)}`|NO||
|取QQ头像|GET|`https://q1.qlogo.cn/g?b=qq&s=${0(size)}&nk=${QQ号}`|NO||
|换群头像|POST|`http://htdata3.qq.com/cgi-bin/httpconn?htcmd=0x6ff0072&ver=5520&ukey=${client.sig.skey}&range=0&uin=${client.uin}&seq=1&groupuin=${群号}&filetype=3&imagetype=5&userdata=0&subcmd=1&subver=101&clip=0_0_0_0&filesize=${字节数}`<br>POST数据：图片字节集|NO||
|取资料(both)|POST|`https://find.qq.com/proxy/domain/cgi.find.qq.com/qqfind/find_v11?backver=2`<br>*※搜索QQ号和群号 且有个性签名等更多信息*<br>POST数据：`bnum=15&pagesize=15&id=0&sid=0&page=0&pageindex=0&ext=&guagua=1&gnum=12&guaguan=2&type=2&ver=4903&longitude=116.405285&latitude=39.904989&lbs_addr_country=%E4%B8%AD%E5%9B%BD&lbs_addr_province=%E5%8C%97%E4%BA%AC&lbs_addr_city=%E5%8C%97%E4%BA%AC%E5%B8%82&keyword=${QQ号}&nf=0&of=0&ldw=${bkn}`|YES|空|
