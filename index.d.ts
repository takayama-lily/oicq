// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import * as log4js from 'log4js';

export type Uin = number;

// 大多数情况下你无需关心这些配置项，因为默认配置就是最常用的，除非你需要一些与默认不同的规则
export interface ConfBot {

    //日志等级，默认info
    //往屏幕打印日志会降低性能，若消息量巨大建议重定向或设置为"warn"屏蔽一般消息日志
    log_level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark" | "off",

    //1:安卓手机(默认) 2:aPad 3:安卓手表 4:MacOS 5:iPad
    platform?: number,

    //被踢下线是否在3秒后重新登陆，默认false
    kickoff?: boolean,

    //群聊是否无视自己的发言，默认true
    ignore_self?: boolean,

    //被风控时是否尝试用分片发送，默认true
    resend?: boolean,

    //raw_message里不使用CQ码字符串，而是使用简短易读的形式(如："[图片][表情]")，可以加快解析速度，默认false
    brief?: boolean,

    //数据存储文件夹，需要可写权限，默认主目录下的data文件夹
    data_dir?: string,

    //触发system.offline.network事件后的重连间隔秒数，默认5(秒)，不建议设置低于3(秒)
    //瞬间的断线重连不会触发此事件，通常你的机器真的没有网络或登陆无响应时才会触发
    //设置为0则不会自动重连，然后你可以监听此事件自己处理
    reconn_interval?: number,

    //一些内部缓存(如群员详细资料、群详细资料等)的生命周期，默认3600(秒)
    //即使不用相关API(使用`no_cache=true`)强制刷新数据，超过这个时间后内部也会自动刷新
    internal_cache_life?: number,

    //手动指定ip和port
    //默认使用msfwifi.3g.qq.com:8080进行连接，若要修改建议优先更改该域名hosts指向而不是手动指定ip
    //@link https://site.ip138.com/msfwifi.3g.qq.com/ 端口通常以下四个都会开放：80,443,8080,14000
    remote_ip?: string,
    remote_port?: number,
}

export interface Statistics {
    readonly start_time: number,
    readonly lost_times: number,
    readonly recv_pkt_cnt: number,
    readonly sent_pkt_cnt: number,
    readonly lost_pkt_cnt: number, //超时未响应的包
    readonly recv_msg_cnt: number,
    readonly sent_msg_cnt: number,
}

export interface Status {
    online: boolean,
    status: number,
    remote_ip?: number,
    remote_port?: number,
    msg_cnt_per_min: number,
    statistics: Statistics,
    config: ConfBot,
}

export type LoginInfo = StrangerInfo & VipInfo;

export type GroupRole = "owner" | "admin" | "member";
export type Gender = "male" | "female" | "unknown";

//////////

export interface RetError {
    code: number,
    message: string,
}
interface RetSuccess<T> {
    retcode: 0,
    status: "ok",
    data: T,
    error: null,
}
interface RetAsync {
    retcode: 1,
    status: "async",
    data: null,
    error: null,
}
interface RetFailure {
    retcode: 100 | 102 | 103 | 104, //100error 102failed 103timeout 104offline
    status: "failed",
    data: null,
    error: RetError,
}
export type Ret<T = null> = RetSuccess<T> | RetAsync | RetFailure;
export type RetCommon = Ret;

//////////

export interface VipInfo {
    readonly user_id?: number,
    readonly nickname?: string,
    readonly level?: number,
    readonly level_speed?: number,
    readonly vip_level?: number,
    readonly vip_growth_speed?: number,
    readonly vip_growth_total?: string,
}

export interface StrangerInfo {
    readonly user_id: number,
    readonly nickname: string,
    readonly sex: Gender,
    readonly age: number,
    readonly area?: string,
    readonly signature?: string,
    readonly description?: string,
    readonly group_id?: number,
}
export interface FriendInfo extends StrangerInfo {
    readonly remark?: string
}
export interface GroupInfo {
    readonly group_id: number,
    readonly group_name: string,
    readonly member_count: number,
    readonly max_member_count: number,
    readonly owner_id: number,
    readonly last_join_time: number,
    readonly last_sent_time: number,
    readonly shutup_time_whole: number, //全员禁言到期时间
    readonly shutup_time_me: number, //我的禁言到期时间
    readonly create_time: number,
    readonly grade: number,
    readonly max_admin_count: number,
    readonly active_member_count: number,
    readonly update_time: number, //当前群资料的最后更新时间
}
export interface MemberBaseInfo {
    readonly user_id: number,
    readonly nickname: string,
    readonly card: string,
    readonly sex: Gender,
    readonly age: number,
    readonly area: string,
    readonly level: number,
    readonly role: GroupRole,
    readonly title: string,
}
export interface MemberInfo extends MemberBaseInfo {
    readonly group_id: number,
    // readonly user_id: number,
    // readonly nickname: string,
    // readonly card: string,
    // readonly sex: Gender,
    // readonly age: number,
    // readonly area: string,
    readonly join_time: number,
    readonly last_sent_time: number,
    // readonly level: number,
    readonly rank: string,
    // readonly role: GroupRole,
    readonly unfriendly: boolean,
    // readonly title: string,
    readonly title_expire_time: number,
    readonly card_changeable: boolean,
    readonly shutup_time: number, //禁言到期时间
    readonly update_time: number, //此群员资料的最后更新时间
}

////////// Message Elements

/**
 * @see https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md
 */
export type MessageElem = TextElem | AtElem | FaceElem | BfaceElem | MfaceElem |
    ImgPttElem | LocationElem | MusicElem | ShareElem | JsonElem | XmlElem |
    AnonymousElem | ReplyElem | NodeElem | ShakeElem | PokeElem | FileElem | VideoElem;

export interface TextElem {
    type: "text",
    data: {
        text: string
    }
}

export interface AtElem {
    type: "at",
    data: {
        qq: number | "all",
        text?: string,
        dummy?: boolean,
    }
}

export interface FaceElem {
    type: "face" | "sface",
    data: {
        id: number,
        text?: string
    }
}

export interface BfaceElem {
    type: "bface",
    data: {
        file: string,
        text: string
    }
}

export interface MfaceElem {
    type: "rps" | "dice",
    data: {
        id: number,
    }
}

/**
 * @typedef MediaFile [CQ:image]中的file参数
 * string或二进制buffer
 * string时支持以下协议：
 *   http(s):// 
 *   base64:// 
 *   /tmp/example.jpg  本地绝对路径
 *   example.jpg  本地相对(于启动目录)路径
 *   file:///  
 *   protobuf://  仅语音和视频转发支持
 */
export type MediaFile = string | Uint8Array | ArrayBuffer | SharedArrayBuffer;
export interface ImgPttElem {
    type: "image" | "flash" | "record",
    data: {
        file: MediaFile,
        cache?: boolean,
        proxy?: boolean,
        timeout?: number,
        url?: string,
        headers?: OutgoingHttpHeaders,
        type?: "flash" | "show",
        magic?: boolean,
    }
}

export interface VideoElem {
    type: "video",
    data: {
        file: string,
        url?: string,
    }
}

export interface LocationElem {
    type: "location",
    data: {
        address: string,
        lat: number,
        lng: number,
        name?: string,
        id?: string,
    }
}

export type MusicType = "qq" | "163" | "migu" | "kugou" | "kuwo";
export interface MusicElem {
    type: "music",
    data: {
        type: MusicType,
        id: string,
    }
}

export interface ShareElem {
    type: "share",
    data: {
        url: string,
        title: string,
        content?: string,
        image?: string,
    }
}

export interface JsonElem {
    type: "json",
    data: {
        data: any, // a json string or a json object
        text?: string,
    }
}

export interface XmlElem {
    type: "xml",
    data: {
        data: string,
        type?: number,
        text?: string,
    }
}

export interface AnonymousElem {
    type: "anonymous",
    data?: {
        ignore?: boolean,
    }
}

export interface ReplyElem {
    type: "reply",
    data: {
        id: string,
    }
}

export interface NodeElem {
    type: "node",
    data: {
        id: string,
    }
}

export interface ShakeElem {
    type: "shake",
}

export interface PokeElem {
    type: "poke",
    data: {
        type: number,
        id?: number,
    }
}

export interface FileElem {
    type: "file",
    data: {
        name: string,
        url: string,
        size: number,
        md5: string,
        duration: number,
        busid: string,
        fileid: string,
    }
}

////////// Events

export interface CommonEventData {
    self_id: number,
    time: number,
    post_type: "system" | "request" | "message" | "notice",
    system_type?: "login" | "online" | "offline",
    request_type?: "friend" | "group",
    message_type?: "private" | "group" | "discuss",
    notice_type?: "friend" | "group",
    sub_type?: string,
}

// system events
export interface CommonSystemEventData extends CommonEventData {
    post_type: "system",
}
export interface CaptchaEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "captcha",
    image: Buffer
}
export interface SliderEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "slider",
    url: string
}
export interface DeviceEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "device",
    url: string,
    phone: string,
}
export interface LoginErrorEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "error",
    code: number,
    message: string,
}
export interface OnlineEventData extends CommonSystemEventData {
    system_type: "online",
}
export interface OfflineEventData extends CommonSystemEventData {
    system_type: "offline",
    sub_type: "network" | "kickoff" | "frozen" | "device" | "unknown",
    message: string,
}

// request events
interface CommonRequestEventData extends CommonEventData {
    post_type: "request",
    user_id: number,
    nickname: string,
    flag: string,
}
export interface FriendAddEventData extends CommonRequestEventData {
    request_type: "friend",
    sub_type: "add",
    comment: string,
    source: string,
    age: number,
    sex: Gender,
}
export interface GroupAddEventData extends CommonRequestEventData {
    request_type: "group",
    sub_type: "add",
    group_id: number,
    group_name: string,
    comment: string,
    inviter_id?: number, //邀请人
}
export interface GroupInviteEventData extends CommonRequestEventData {
    request_type: "group",
    sub_type: "invite",
    group_id: number,
    group_name: string,
    role: GroupRole, //邀请者权限
}

// message events
interface CommonMessageEventData extends CommonEventData {
    post_type: "message",
    message: MessageElem[],
    raw_message: string,
    message_id: string,
    user_id: number,
    font: string,
    reply: (message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean) => Promise<Ret<{ message_id: string }>>,
}
export interface PrivateMessageEventData extends CommonMessageEventData {
    message_type: "private",
    sub_type: "friend" | "group" | "single" | "other",
    sender: FriendInfo,
    auto_reply: boolean,
}
export interface GroupMessageEventData extends CommonMessageEventData {
    message_type: "group",
    sub_type: "normal" | "anonymous",
    group_id: number,
    group_name: string,
    anonymous: Anonymous | null,
    sender: MemberBaseInfo,
}
export interface Anonymous {
    id: number,
    name: string,
    flag: string,
}
export interface DiscussMessageEventData extends CommonMessageEventData {
    message_type: "discuss",
    discuss_id: number,
    discuss_name: string,
    sender: {
        user_id: number,
        nickname: string,
        card: string,
    },
}

// notice events
interface CommonFriendNoticeEventData extends CommonEventData {
    post_type: "notice",
    notice_type: "friend",
}
export interface FriendRecallEventData extends CommonFriendNoticeEventData {
    sub_type: "recall",
    user_id: number,
    operator_id: number,
    message_id: string,
}
export interface FriendProfileEventData extends CommonFriendNoticeEventData {
    sub_type: "profile",
    user_id: number,
    nickname?: string,
    signature?: string,
}
export interface FriendIncreaseEventData extends CommonFriendNoticeEventData {
    sub_type: "increase",
    user_id: number,
    nickname: string,
}
export interface FriendDecreaseEventData extends CommonFriendNoticeEventData {
    sub_type: "decrease",
    user_id: number,
    nickname: string,
}
export interface FriendPokeEventData extends CommonEventData {
    sub_type: "poke",
    user_id: number,
    operator_id: number,
    target_id: number,
    action: string,
    suffix: string
}

interface CommonGroupNoticeEventData extends CommonEventData {
    post_type: "notice",
    notice_type: "group",
}
export interface GroupPokeEventData extends CommonGroupNoticeEventData {
    sub_type: "poke",
    group_id: number,
    operator_id: number,
    user_id: number,
    action: string,
    suffix: string
}
export interface MemberIncreaseEventData extends CommonGroupNoticeEventData {
    sub_type: "increase",
    group_id: number,
    user_id: number,
    nickname: string,
}
export interface MemberDecreaseEventData extends CommonGroupNoticeEventData {
    sub_type: "decrease",
    group_id: number,
    operator_id: number,
    user_id: number,
    dismiss: boolean,
    member?: MemberInfo,
}
export interface GroupRecallEventData extends CommonGroupNoticeEventData {
    sub_type: "recall",
    group_id: number,
    operator_id: number,
    user_id: number,
    message_id: string,
}
export interface GroupAdminEventData extends CommonGroupNoticeEventData {
    sub_type: "admin",
    group_id: number,
    user_id: number,
    set: boolean,
}
export interface GroupMuteEventData extends CommonGroupNoticeEventData {
    sub_type: "ban",
    group_id: number,
    operator_id: number,
    user_id: number,
    nickname?: string,
    duration: number,
}
export interface GroupTransferEventData extends CommonGroupNoticeEventData {
    sub_type: "transfer",
    group_id: number,
    operator_id: number,
    user_id: number,
}
export interface GroupTitleEventData extends CommonGroupNoticeEventData {
    sub_type: "title",
    group_id: number,
    user_id: number,
    nickname: string,
    title: string,
}
export interface GroupSettingEventData extends CommonGroupNoticeEventData {
    sub_type: "setting",
    group_id: number,
    group_name?: string,
    enable_guest?: boolean,
    enable_anonymous?: boolean,
    enable_upload_album?: boolean,
    enable_upload_file?: boolean,
    enable_temp_chat?: boolean,
    enable_new_group?: boolean,
    enable_show_honor?: boolean,
    enable_show_level?: boolean,
    enable_show_title?: boolean,
    enable_confess?: boolean,
}

export type FriendNoticeEventData = FriendIncreaseEventData | FriendDecreaseEventData | FriendRecallEventData |
    FriendProfileEventData | FriendPokeEventData; //5
export type GroupNoticeEventData = GroupRecallEventData | GroupSettingEventData | GroupTitleEventData |
    GroupTransferEventData | GroupMuteEventData | GroupAdminEventData |
    MemberIncreaseEventData | MemberDecreaseEventData | GroupPokeEventData; //9

export type SystemEventData = CaptchaEventData | DeviceEventData | SliderEventData | LoginErrorEventData |
    OfflineEventData | OnlineEventData; //6(4+2)
export type RequestEventData = FriendAddEventData | GroupAddEventData | GroupInviteEventData; //3
export type MessageEventData = PrivateMessageEventData | GroupMessageEventData | DiscussMessageEventData; //3
export type NoticeEventData = FriendNoticeEventData | GroupNoticeEventData; //2
export type EventData = SystemEventData | RequestEventData | MessageEventData | NoticeEventData; //4


//////////

export class Client extends EventEmitter {

    readonly uin: number;
    readonly password_md5: Buffer;
    readonly nickname: string;
    readonly sex: Gender;
    readonly age: number;
    readonly online_status: number; //在线状态
    readonly fl: ReadonlyMap<number, FriendInfo>; //好友列表
    readonly sl: ReadonlyMap<number, StrangerInfo>; //陌生人列表
    readonly gl: ReadonlyMap<number, GroupInfo>; //群列表
    readonly gml: ReadonlyMap<number, ReadonlyMap<number, MemberInfo>>; //群员列表
    readonly logger: log4js.Logger;
    readonly dir: string; //当前账号本地存储路径
    readonly config: ConfBot;
    readonly stat: Statistics; //数据统计
    readonly plugins: Set<NodeJS.Module>;

    constructor(uin: number, config?: ConfBot);
    login(password?: Uint8Array | string): void; //密码支持明文和md5

    /**
     * @deprecated
     */
    captchaLogin(captcha: string): void;
    sliderLogin(ticket: string): void;
    terminate(): void; //直接关闭连接
    logout(): Promise<void>; //先下线再关闭连接
    isOnline(): boolean;

    //发短信过设备锁
    sendSMSCode(): void;
    submitSMSCode(code: string): void;

    /**
     * 设置在线状态
     * @param status 11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
     */
    setOnlineStatus(status: number): Promise<Ret>;

    getFriendList(): Ret<Client["fl"]>; //获取好友列表，建议直接访问 this.fl
    getStrangerList(): Ret<Client["sl"]>; //获取陌生人列表，建议直接访问 this.sl
    getGroupList(): Ret<Client["gl"]>; //获取群列表，建议直接访问 this.gl
    getGroupMemberList(group_id: number, no_cache?: boolean): Promise<Ret<ReadonlyMap<number, MemberInfo>>>; //获取群员列表，建议直接访问 this.gml.get(gid)

    getStrangerInfo(user_id: number, no_cache?: boolean): Promise<Ret<StrangerInfo>>; //获取陌生人资料
    getGroupInfo(group_id: number, no_cache?: boolean): Promise<Ret<GroupInfo>>; //获取群资料
    getGroupMemberInfo(group_id: number, user_id: number, no_cache?: boolean): Promise<Ret<MemberInfo>>; //获取群员资料

    sendPrivateMsg(user_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    sendGroupMsg(group_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    sendTempMsg(group_id: number, user_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    sendDiscussMsg(discuss_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret>;
    deleteMsg(message_id: string): Promise<Ret>; //撤回

    /**
     * 获取一条消息
     * 无法获取被撤回的消息
     */
    getMsg(message_id: string): Promise<Ret<PrivateMessageEventData | GroupMessageEventData>>;

    /**
     * 获取message_id往前的count条消息(包括自身)
     * 无法获取被撤回的消息，因此返回的数量并不一定为count
     * count默认为20，不能超过20
     * 
     * 若要获取最新的20条消息，参考https://github.com/takayama-lily/oicq/wiki/93.%E8%A7%A3%E6%9E%90%E6%B6%88%E6%81%AFID
     * 自行构造消息id，除群号外其余位补0
     */
    getChatHistory(message_id: string, count?: number): Promise<Ret<PrivateMessageEventData[] | GroupMessageEventData[]>>;

    /**
     * 获取转发消息
     * resid在xml消息中，需要自行解析xml获得
     * 暂不支持套娃转发解析
     */
    getForwardMsg(resid: string): Promise<Ret<Array<{
        group_id?: number,
        user_id: number,
        nickname: number,
        time: number,
        message: MessageElem[],
        raw_message: string,
    }>>>;

    sendGroupNotice(group_id: number, content: string): Promise<Ret>; //发群公告
    setGroupName(group_id: number, group_name: string): Promise<Ret>; //设置群名
    setGroupAnonymous(group_id: number, enable?: boolean): Promise<Ret>; //设置允许匿名发言
    setGroupWholeBan(group_id: number, enable?: boolean): Promise<Ret>; //全员禁言
    setGroupAdmin(group_id: number, user_id: number, enable?: boolean): Promise<Ret>; //设置群管理
    setGroupSpecialTitle(group_id: number, user_id: number, special_title?: string, duration?: number): Promise<Ret>; //设置群头衔
    setGroupCard(group_id: number, user_id: number, card?: string): Promise<Ret>; //设置群名片
    setGroupKick(group_id: number, user_id: number, reject_add_request?: boolean): Promise<Ret>; //踢人
    setGroupBan(group_id: number, user_id: number, duration?: number): Promise<Ret>; //禁言
    setGroupAnonymousBan(group_id: number, flag: string, duration?: number): Promise<Ret>; //禁言匿名
    setGroupLeave(group_id: number, is_dismiss?: boolean): Promise<Ret>; //退群
    sendGroupPoke(group_id: number, user_id: number): Promise<Ret>; //戳一戳

    setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<Ret>; //处理好友请求
    setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<Ret>; //处理群请求
    getSystemMsg(): Promise<Ret<Array<FriendAddEventData | GroupAddEventData | GroupInviteEventData>>>; //获取未处理的请求

    addGroup(group_id: number, comment?: string): Promise<Ret>;
    addFriend(group_id: number, user_id: number, comment?: string): Promise<Ret>; //添加群员为好友
    deleteFriend(user_id: number, block?: boolean): Promise<Ret>; //删除好友
    inviteFriend(group_id: number, user_id: number): Promise<Ret>; //邀请好友入群
    sendLike(user_id: number, times?: number): Promise<Ret>; //点赞

    setNickname(nickname: string): Promise<Ret>; //设置昵称
    setGender(gender: 0 | 1 | 2): Promise<Ret>; //设置性别 0未知 1男 2女
    setBirthday(birthday: string | number): Promise<Ret>; //设置生日 20110202的形式
    setDescription(description?: string): Promise<Ret>; //设置个人说明
    setSignature(signature?: string): Promise<Ret>; //设置个人签名
    setPortrait(file: MediaFile): Promise<Ret>; //设置个人头像
    setGroupPortrait(group_id: number, file: MediaFile): Promise<Ret>; //设置群头像

    // getFile(fileid: string, busid?: string): Promise<Ret<FileElem["data"]>>; //用于下载链接失效后重新获取

    /**
     * 预先上传图片以备发送
     * 通常图片在发送时一并上传
     * 提前上传可用于加快发送速度，实现秒发
     */
    preloadImages(files: Iterable<MediaFile>): Promise<Ret<string[]>>;

    /**
     * 获取漫游表情
     */
    getRoamingStamp(no_cache?: boolean): Promise<Ret<string[]>>;

    /**
     * 获取群公告
     */
    getGroupNotice(group_id: number): Promise<Ret<Array<{
        u: number, //发布者
        fid: string,
        pubt: number, //发布时间
        msg: {
            text: string,
            title: string,
            pics?: Array<{
                id: string,
                w: string,
                h: string,
            }>,
        },
        type: number,
        settings: {
            is_show_edit_card: number,
            remind_ts: number,
            tip_window_type: number,
            confirm_required: number
        },
        read_num: number,
        is_read: number,
        is_all_confirm: number
    }>>>;

    getCookies(domain?: string): Promise<Ret<{ cookies: string }>>;
    getCsrfToken(): Promise<Ret<{ token: number }>>;
    cleanCache(type?: "image" | "record"): Promise<Ret>;
    canSendImage(): Ret;
    canSendRecord(): Ret;
    getVersionInfo(): Ret; //暂时为返回package.json中的信息
    getStatus(): Ret<Status>;
    getLoginInfo(): Ret<LoginInfo>;

    on(event: "system.login.captcha", listener: (this: Client, data: CaptchaEventData) => void): this;
    on(event: "system.login.slider", listener: (this: Client, data: SliderEventData) => void): this; //收到滑动验证码事件
    on(event: "system.login.device", listener: (this: Client, data: DeviceEventData) => void): this; //设备锁验证事件
    on(event: "system.login.error", listener: (this: Client, data: LoginErrorEventData) => void): this; //登录遇到错误
    on(event: "system.login", listener: (this: Client, data: CaptchaEventData | DeviceEventData | LoginErrorEventData | SliderEventData) => void): this;
    on(event: "system.online", listener: (this: Client, data: OnlineEventData) => void): this; //上线事件
    on(event: "system.offline" | "system.offline.network" | "system.offline.kickoff" | //下线事件
        "system.offline.frozen" | "system.offline.device" | "system.offline.unknown", listener: (this: Client, data: OfflineEventData) => void): this;
    on(event: "system", listener: (this: Client, data: SystemEventData) => void): this;

    on(event: "request.friend" | "request.friend.add", listener: (this: Client, data: FriendAddEventData) => void): this; //收到好友申请事件
    on(event: "request.group.add", listener: (this: Client, data: GroupAddEventData) => void): this; //收到加群申请事件
    on(event: "request.group.invite", listener: (this: Client, data: GroupInviteEventData) => void): this; //收到群邀请事件
    on(event: "request.group", listener: (this: Client, data: GroupAddEventData | GroupInviteEventData) => void): this;
    on(event: "request", listener: (this: Client, data: RequestEventData) => void): this; //监听以上所有request事件

    on(event: "message.private" | "message.private.friend" | "message.private.group" |
        "message.private.single" | "message.private.other", listener: (this: Client, data: PrivateMessageEventData) => void): this; //私聊消息事件
    on(event: "message.group" | "message.group.normal" | "message.group.anonymous", listener: (this: Client, data: GroupMessageEventData) => void): this; //群消息事件
    on(event: "message.discuss", listener: (this: Client, data: DiscussMessageEventData) => void): this; //讨论组消息事件
    on(event: "message", listener: (this: Client, data: MessageEventData) => void): this; //监听以上所有message事件

    on(event: "notice.friend.increase", listener: (this: Client, data: FriendIncreaseEventData) => void): this; //新增好友事件
    on(event: "notice.friend.decrease", listener: (this: Client, data: FriendDecreaseEventData) => void): this; //好友(被)删除事件
    on(event: "notice.friend.recall", listener: (this: Client, data: FriendRecallEventData) => void): this; //好友撤回事件
    on(event: "notice.friend.profile", listener: (this: Client, data: FriendProfileEventData) => void): this; //好友资料变更事件
    on(event: "notice.friend.poke", listener: (this: Client, data: FriendPokeEventData) => void): this; //好友戳一戳事件
    on(event: "notice.group.increase", listener: (this: Client, data: MemberIncreaseEventData) => void): this; //踢群・退群事件
    on(event: "notice.group.decrease", listener: (this: Client, data: MemberDecreaseEventData) => void): this; //入群・群员增加事件
    on(event: "notice.group.recall", listener: (this: Client, data: GroupRecallEventData) => void): this; //群消息撤回事件
    on(event: "notice.group.admin", listener: (this: Client, data: GroupAdminEventData) => void): this; //管理员变更事件
    on(event: "notice.group.ban", listener: (this: Client, data: GroupMuteEventData) => void): this; //群禁言事件
    on(event: "notice.group.transfer", listener: (this: Client, data: GroupTransferEventData) => void): this; //群转让事件
    on(event: "notice.group.title", listener: (this: Client, data: GroupTitleEventData) => void): this; //群头衔变更事件
    on(event: "notice.group.poke", listener: (this: Client, data: GroupPokeEventData) => void): this; //群戳一戳事件
    on(event: "notice.group.setting", listener: (this: Client, data: GroupSettingEventData) => void): this; //群设置变更事件
    on(event: "notice.friend", listener: (this: Client, data: FriendNoticeEventData) => void): this; //监听以上所有好友notice事件
    on(event: "notice.group", listener: (this: Client, data: GroupNoticeEventData) => void): this; //监听以上所有群notice事件
    on(event: "notice", listener: (this: Client, data: NoticeEventData) => void): this; //监听以上所有notice事件

    on(event: string | symbol, listener: (this: Client, ...args: any[]) => void): this;

    /**
     * 重载好友列表和群列表
     * 完成之前bot不接受其他任何请求，也不会上报任何事件
     */
    reloadFriendList(): Promise<Ret>;
    reloadGroupList(): Promise<Ret>;
}

export function createClient(uin: number, config?: ConfBot): Client;

/**
 * 生成消息元素的快捷函数
 */
export namespace segment {
    function text(text: string): TextElem; //普通文本
    function at(qq: number, text?: string, dummy?: boolean): AtElem; //at
    function face(id: number, text?: string): FaceElem; //经典表情
    function sface(id: number, text?: string): FaceElem;
    function bface(file: string): BfaceElem; //原创表情
    function rps(id?: number): MfaceElem; //猜拳
    function dice(id?: number): MfaceElem; //骰子
    function image(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders, proxy?: boolean): ImgPttElem; //图片
    function flash(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders, proxy?: boolean): ImgPttElem; //闪照
    function record(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders, proxy?: boolean): ImgPttElem; //语音
    function location(lat: number, lng: number, address: string, id?: string): LocationElem; //位置分享
    function music(type: MusicType, id: string): MusicElem; //音乐分享
    function json(data: any): JsonElem;
    function xml(data: string, type?: number): XmlElem;
    function share(url: string, title: string, image?: string, content?: string): ShareElem; //内容分享
    function shake(): ShakeElem; //抖动
    function poke(type: number, id?: number): PokeElem; //戳一戳
    function reply(id: string): ReplyElem; //引用回复
    function node(id: string): NodeElem; //转发节点
    function anonymous(ignore?: boolean): AnonymousElem; //匿名

    //将元素转换到CQ码字符串 (CQ码字符串无法逆转换到元素，因为类型会丢失)
    function toCqcode(elem: MessageElem): string;
    function toCqcode(elems: Iterable<MessageElem>): string;
}

/**
 * 生成CQ码字符串的快捷函数
 */
export namespace cqcode {
    function text(text: string): string;
    function at(qq: number, text?: string, dummy?: boolean): string;
    function face(id: number, text?: string): string;
    function sface(id: number, text?: string): string;
    function bface(file: string): string;
    function rps(id?: number): string;
    function dice(id?: number): string;
    function image(file: string, cache?: boolean, timeout?: number, headers?: string, proxy?: boolean): string;
    function flash(file: string, cache?: boolean, timeout?: number, headers?: string, proxy?: boolean): string;
    function record(file: string, cache?: boolean, timeout?: number, headers?: string, proxy?: boolean): string;
    function location(lat: number, lng: number, address: string, id?: string): string;
    function music(type: MusicType, id: string): string;
    function json(data: string): string;
    function xml(data: string, type?: number): string;
    function share(url: string, title: string, image?: string, content?: string): string;
    function shake(): string;
    function poke(type: number, id?: number): string;
    function reply(id: string): string;
    function node(id: string): string;
    function anonymous(ignore?: boolean): string;
}

/**
 * 一个内置控制台指令分发器
 * 用于接收stdin输入，并根据前缀匹配分发到所注册的函数
 */
export namespace stdin {
    function registerCommand(cmd: string, callback: (input: string) => void): void;
    function deregisterCommand(cmd: string, callback: (input: string) => void): void;
    function enable(): void;
    function disable(): void;
}
