// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import * as log4js from 'log4js';

export type Uin = number;

/** 大多数情况下你无需关心这些配置项，因为默认配置就是最常用的，除非你需要一些与默认不同的规则 */
export interface ConfBot {

    /** 日志等级，默认info (往屏幕打印日志会降低性能，若消息量巨大建议修改此参数或重定向) */
    log_level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark" | "off",
    /** 1:安卓手机(默认) 2:aPad 3:安卓手表 4:MacOS 5:iPad */
    platform?: number,
    /** 被踢下线是否在3秒后重新登陆，默认false */
    kickoff?: boolean,
    /** 群聊是否过滤自己的发言，默认true */
    ignore_self?: boolean,
    /** 被风控时是否尝试用分片发送，默认true */
    resend?: boolean,
    /** raw_message里是否不使用CQ码字符串，而是使用简短易读的形式(如："[图片][表情]")，可以加快解析速度，默认false */
    brief?: boolean,
    /** 数据存储文件夹，需要可写权限，默认主模块下的data文件夹 */
    data_dir?: string,

    //触发system.offline.network事件后的重连间隔秒数，默认5(秒)，不建议设置低于3(秒)
    //瞬间的断线重连不会触发此事件，通常你的机器真的没有网络或登陆无响应时才会触发
    //设置为0则不会自动重连，然后你可以监听此事件自己处理
    reconn_interval?: number,

    //一些内部缓存(如群员详细资料、群详细资料等)的生命周期，默认3600(秒)
    //即使不用相关API(使用`no_cache=true`)强制刷新数据，超过这个时间后内部也会自动刷新
    internal_cache_life?: number,

    /** 自动选择最优服务器(默认开启)，关闭后会一直使用`msfwifi.3g.qq.com`进行连接 */
    auto_server?: boolean;

    /** 手动指定ip和port，不推荐使用，大多数情况下你应该使用auto_server */
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
 * 使用cqhttp风格的消息元素类型
 * @see https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md
 */
export type MessageElem = TextElem | AtElem | FaceElem | BfaceElem | MfaceElem |
    ImgPttElem | LocationElem | MusicElem | ShareElem | JsonElem | XmlElem |
    AnonymousElem | ReplyElem | NodeElem | ShakeElem | PokeElem | FileElem | VideoElem | MiraiElem;

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
 * @typedef MediaFile 为string时等同于[CQ:image]中的file参数
 * string支持以下写法：
 *   http(s):// 
 *   base64:// 
 *   /tmp/example.jpg  本地绝对路径
 *   example.jpg  本地相对(于启动目录的)路径
 *   file:///  
 *   protobuf://  仅用于语音和视频的转发
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
        file: string, //发送仅支持本地文件
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
        type?: number, //type为35的是合并转发
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

export interface MiraiElem {
    type: "mirai",
    data: {
        data: string,
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
        /** @deprecated */
        busid: number,
        /** @deprecated */
        fileid: string,
        fid: string,
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
    at_me: boolean,
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
    at_me: boolean,
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
export interface FriendPokeEventData extends CommonFriendNoticeEventData {
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

////////// group file system

export interface GfsBaseStat {
    fid: string, //文件(夹)id
    pid: string, //父文件夹id
    name: string,
    user_id: number,
    create_time: number,
}
export interface GfsFileStat extends GfsBaseStat {
    size: number,
    busid: number,
    md5: string,
    sha1: string,
    duration: number,
    download_times: number,
}
export interface GfsDirStat extends GfsBaseStat {
    file_count: number,
    is_dir: true,
}
export type GfsStat = GfsFileStat | GfsDirStat;

/**
 * 这里面的方法是会reject的，需要catch
 * node15开始，unhandledRejection默认会升级为uncaughtException导致程序退出
 */
export class Gfs {
    private constructor();
    /** 群号 */
    readonly gid: number;
    /** 查看文件属性(尽量不要对目录使用此方法) */
    stat(fid: string): Promise<GfsStat>;
    /** 列出文件，start从0开始，limit默认100(最大) */
    ls(fid?: string, start?: number, limit?: number): Promise<GfsStat[]>;
    /** ls的别名 */
    dir: Gfs["ls"];
    /** 创建目录 */
    mkdir(name: string): Promise<GfsDirStat>;
    /** 删除文件或目录(删除目标是目录的时候会删除下面的所有文件) */
    rm(fid: string): Promise<void>; 
    /** 重命名文件或目录 */
    rename(fid: string, name: string): Promise<void>;
    /** 移动文件到其他目录 */
    mv(fid: string, pid: string): Promise<void>;
    /** 查看可用空间和文件数量 */
    df(): Promise<{
        total: number,
        used: number,
        free: number,
        file_count: number,
        max_file_count: number,
    }>;
    /** 上传文件(默认传到根目录),仅支持本地文件路径或Buffer */
    upload(file: MediaFile, pid?: string, name?: string): Promise<GfsFileStat>;
    /** 获取文件的下载链接 */
    download(fid: string): Promise<FileElem["data"]>;
}

//////////

/**
 * 方法不会reject或抛出异常，使用retcode判断是否成功
 * @see {Ret}
 */
export class Client extends EventEmitter {

    readonly uin: number;
    readonly password_md5: Buffer;
    readonly nickname: string;
    readonly sex: Gender;
    readonly age: number;
    /** 在线状态 */
    readonly online_status: number;
    /** 好友列表 */
    readonly fl: ReadonlyMap<number, FriendInfo>;
    /** 陌生人列表 */
    readonly sl: ReadonlyMap<number, StrangerInfo>;
    /** 群列表 */
    readonly gl: ReadonlyMap<number, GroupInfo>;
    /** 群员列表 */
    readonly gml: ReadonlyMap<number, ReadonlyMap<number, MemberInfo>>;
    /** 日志记录器 */
    readonly logger: log4js.Logger;
    /** 当前账号本地存储路径 */
    readonly dir: string;
    /** 配置信息(大部分参数支持热修改) */
    readonly config: ConfBot;
    /** 数据统计信息 */
    readonly stat: Statistics;

    constructor(uin: number, config?: ConfBot);

    /**
     * @param password 明文或md5后的密码，重复调用时可无需传入此参数
     */
    login(password?: Uint8Array | string): void;

    /** 提交滑动验证码ticket */
    sliderLogin(ticket: string): void;
    /** 先下线再关闭连接 */
    logout(): Promise<void>;
    isOnline(): boolean;

    /** 发验证码给密保手机，用于发短信过设备锁 */
    sendSMSCode(): void;
    /** 提交收到的短信验证码 */
    submitSMSCode(code: string): void;

    /**
     * 设置在线状态
     * @param status 11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰
     */
    setOnlineStatus(status: number): Promise<Ret>;

    /** @deprecated 获取好友列表，请直接访问 this.fl */
    getFriendList(): Ret<Client["fl"]>;
    /** @deprecated 获取陌生人列表，请直接访问 this.sl */
    getStrangerList(): Ret<Client["sl"]>;
    /** @deprecated 获取群列表，请直接访问 this.gl */
    getGroupList(): Ret<Client["gl"]>;
    /** 获取群成员列表 */
    getGroupMemberList(group_id: number, no_cache?: boolean): Promise<Ret<ReadonlyMap<number, MemberInfo>>>;

    /** 获取陌生人资料 */
    getStrangerInfo(user_id: number, no_cache?: boolean): Promise<Ret<StrangerInfo>>;
    /** 获取群资料 */
    getGroupInfo(group_id: number, no_cache?: boolean): Promise<Ret<GroupInfo>>;
    /** 获取群员资料 */
    getGroupMemberInfo(group_id: number, user_id: number, no_cache?: boolean): Promise<Ret<MemberInfo>>;

    /** 私聊 */
    sendPrivateMsg(user_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    /** 群聊 */
    sendGroupMsg(group_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    /** 群临时会话，大多数时候可以使用私聊达到同样效果 */
    sendTempMsg(group_id: number, user_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>;
    /** 讨论组 */
    sendDiscussMsg(discuss_id: number, message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean): Promise<Ret>;
    /** 撤回 */
    deleteMsg(message_id: string): Promise<Ret>;
    /** 获取一条消息(无法获取被撤回的消息) */
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
        nickname: string,
        time: number,
        message: MessageElem[],
        raw_message: string,
    }>>>;

    /** 发群公告 */
    sendGroupNotice(group_id: number, content: string): Promise<Ret>;
    /** 设置群名 */
    setGroupName(group_id: number, group_name: string): Promise<Ret>;
    /** 开启或关闭匿名 */
    setGroupAnonymous(group_id: number, enable?: boolean): Promise<Ret>;
    /** 全员禁言 */
    setGroupWholeBan(group_id: number, enable?: boolean): Promise<Ret>;
    /** 设置管理员 */
    setGroupAdmin(group_id: number, user_id: number, enable?: boolean): Promise<Ret>;
    /** 设置群头衔 */
    setGroupSpecialTitle(group_id: number, user_id: number, special_title?: string, duration?: number): Promise<Ret>;
    /** 设置群名片 */
    setGroupCard(group_id: number, user_id: number, card?: string): Promise<Ret>;
    /** 踢人(不支持批量) */
    setGroupKick(group_id: number, user_id: number, reject_add_request?: boolean): Promise<Ret>;
    /** 禁言 */
    setGroupBan(group_id: number, user_id: number, duration?: number): Promise<Ret>;
    /** 禁言匿名玩家 */
    setGroupAnonymousBan(group_id: number, flag: string, duration?: number): Promise<Ret>;
    /** 退群 */
    setGroupLeave(group_id: number, is_dismiss?: boolean): Promise<Ret>;
    /** 戳一戳 */
    sendGroupPoke(group_id: number, user_id: number): Promise<Ret>;

    /** 处理好友请求 */
    setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<Ret>;
    /** 处理群请求 */
    setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<Ret>;
    /** 获取未处理的请求 */
    getSystemMsg(): Promise<Ret<Array<FriendAddEventData | GroupAddEventData | GroupInviteEventData>>>;

    /** 该接口风控 */
    addGroup(group_id: number, comment?: string): Promise<Ret>;
    /** 添加好友，只能添加群友 */
    addFriend(group_id: number, user_id: number, comment?: string): Promise<Ret>;
    /** 删除好友 */
    deleteFriend(user_id: number, block?: boolean): Promise<Ret>;
    /** 邀请好友入群(不支持陌生人和批量) */
    inviteFriend(group_id: number, user_id: number): Promise<Ret>;
    /** 点赞(times默认1，不支持陌生人)  */
    sendLike(user_id: number, times?: number): Promise<Ret>;

    /** 设置昵称 */
    setNickname(nickname: string): Promise<Ret>;
    /** 设置性别(0未知 1男 2女) */
    setGender(gender: 0 | 1 | 2): Promise<Ret>;
    /** 设置生日(20110202的形式) */
    setBirthday(birthday: string | number): Promise<Ret>;
    /** 设置个人说明 */
    setDescription(description?: string): Promise<Ret>;
    /** 设置个人签名 */
    setSignature(signature?: string): Promise<Ret>;
    /** 设置个人头像 */
    setPortrait(file: MediaFile): Promise<Ret>; //
    /** 设置群头像 */
    setGroupPortrait(group_id: number, file: MediaFile): Promise<Ret>;

    /**
     * 预先上传图片以备发送
     * 通常图片在发送时一并上传
     * 提前上传可用于加快发送速度，实现秒发
     */
    preloadImages(files: Iterable<MediaFile>): Promise<Ret<string[]>>;

    /** 获取漫游表情 */
    getRoamingStamp(no_cache?: boolean): Promise<Ret<string[]>>;

    /** 获取群公告 */
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

    /**
     * 支持的域名：
     * tenpay.com | docs.qq.com | office.qq.com | connect.qq.com
     * vip.qq.com | mail.qq.com | qzone.qq.com | gamecenter.qq.com
     * mma.qq.com | game.qq.com | qqweb.qq.com | openmobile.qq.com
     * qun.qq.com | ti.qq.com |
     */
    getCookies(domain?: string): Promise<Ret<{ cookies: string }>>;
    getCsrfToken(): Promise<Ret<{ token: number }>>;
    /** 清除 image 和 record 文件夹下的缓存文件 */
    cleanCache(type?: "image" | "record"): Promise<Ret>;
    /** 获取在线状态和数据统计 */
    getStatus(): Ret<Status>;
    /** 获取登录账号信息 */
    getLoginInfo(): Ret<LoginInfo>;
    /** 获取等级信息(默认获取自己的) */
    getLevelInfo(user_id?: number): Promise<Ret<any>>;

    /** 进入群文件系统 */
    acquireGfs(group_id: number): Gfs;

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
    on(event: "notice.group.increase", listener: (this: Client, data: MemberIncreaseEventData) => void): this; //入群・群员增加事件
    on(event: "notice.group.decrease", listener: (this: Client, data: MemberDecreaseEventData) => void): this; //踢群・退群事件
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
     * 完成之前无法调用任何api，也不会上报任何事件
     */
    reloadFriendList(): Promise<Ret>;
    reloadGroupList(): Promise<Ret>;

    /** @deprecated 直接关闭连接 */
    terminate(): void;
    /** @deprecated 文字验证码 */
    captchaLogin(captcha: string): void;
    /** @deprecated */
    canSendImage(): Ret;
    /** @deprecated */
    canSendRecord(): Ret;
    /** @deprecated 获取版本信息(暂时为返回package.json中的信息) */
    getVersionInfo(): Ret<any>;
}

/** 工厂方法 */
export function createClient(uin: number, config?: ConfBot): Client;

/**
 * 生成消息元素的快捷函数
 */
export namespace segment {
    /** 普通文本 */
    function text(text: string): TextElem;
    /** at */
    function at(qq: number, text?: string, dummy?: boolean): AtElem;
    /** 经典表情 */
    function face(id: number, text?: string): FaceElem;
    /** 小表情 */
    function sface(id: number, text?: string): FaceElem;
    /** 原创表情 */
    function bface(file: string): BfaceElem;
    /** 猜拳 */
    function rps(id?: number): MfaceElem;
    /** 骰子 */
    function dice(id?: number): MfaceElem;
    /** 图片(后三个参数在下载网络图片时有效) */
    function image(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): ImgPttElem;
    /** 闪照 */
    function flash(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): ImgPttElem;
    /** 语音 */
    function record(file: MediaFile, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): ImgPttElem;
    /** 位置分享 */
    function location(lat: number, lng: number, address: string, id?: string): LocationElem;
    /** 音乐分享 */
    function music(type: MusicType, id: string): MusicElem;
    /** JSON消息 */
    function json(data: any): JsonElem;
    /** XML消息 */
    function xml(data: string, type?: number): XmlElem;
    /** 内容分享 */
    function share(url: string, title: string, image?: string, content?: string): ShareElem;
    /** 窗口抖动 */
    function shake(): ShakeElem;
    /** 戳一戳 */
    function poke(type: number, id?: number): PokeElem;
    /** 引用回复 */
    function reply(id: string): ReplyElem;
    /** 转发节点 */
    function node(id: string): NodeElem;
    /** 匿名 */
    function anonymous(ignore?: boolean): AnonymousElem;
    /** 只有mirai系客户端可以解析的消息 */
    function mirai(data: string): MiraiElem;

    /** 将元素转换到CQ码字符串(CQ码字符串无法逆转换到元素，因为类型会丢失) */
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
    function image(file: string, cache?: boolean, timeout?: number, headers?: string): string;
    function flash(file: string, cache?: boolean, timeout?: number, headers?: string): string;
    function record(file: string, cache?: boolean, timeout?: number, headers?: string): string;
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
    function mirai(data: string): string;
}
