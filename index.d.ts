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
    /** 群聊是否屏蔽自己的发言，默认true */
    ignore_self?: boolean,
    /** 被风控时是否尝试用分片发送，默认true */
    resend?: boolean,
    /** raw_message里是否不使用CQ码字符串，而是使用简短易读的形式(如："[图片][表情]")，可以加快解析速度，默认false */
    brief?: boolean,
    /** 数据存储文件夹，需要可写权限，默认主模块下的data文件夹 */
    data_dir?: string,

    //触发system.offline.network事件后的重连间隔秒数，默认5(秒)，不建议设置低于3(秒)
    //设置为0则不会自动重连，然后你可以监听此事件自己处理
    reconn_interval?: number,

    //一些内部缓存(如群员详细资料、群详细资料等)的生命周期，默认3600(秒)
    //即使不用相关API(使用`no_cache=true`)强制刷新数据，超过这个时间后内部也会自动刷新
    internal_cache_life?: number,

    /** 自动选择最优服务器(默认true)，关闭后会一直使用`msfwifi.3g.qq.com`进行连接 */
    auto_server?: boolean;

    /** 手动指定ip和port，不推荐使用，大多数情况下你应该使用auto_server */
    remote_ip?: string,
    remote_port?: number,

    /** ffmpeg */
    ffmpeg_path?: string,
    ffprobe_path?: string,
}

export interface Statistics {
    readonly start_time: number, //启动时刻
    readonly lost_times: number, //断线次数
    readonly recv_pkt_cnt: number, //收到包总数
    readonly sent_pkt_cnt: number, //发送包总数
    readonly lost_pkt_cnt: number, //丢包总数
    readonly recv_msg_cnt: number, //收到消息总数
    readonly sent_msg_cnt: number, //发送消息总数
}

export interface Status {
    online: boolean,
    status: number, //在线状态
    remote_ip?: number,
    remote_port?: number,
    msg_cnt_per_min: number, //每分钟消息数
    statistics: Statistics,
    config: ConfBot,
}

export type LoginInfo = StrangerInfo;

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

/** 陌生人资料 */
export interface StrangerInfo {
    readonly user_id: number, //账号
    readonly nickname: string, //昵称
    readonly sex: Gender, //性别
    readonly age: number, //年龄
    readonly area?: string, //地区
    readonly signature?: string, //个性签名
    readonly description?: string, //个人说明
    readonly group_id?: number, //临时会话群号
}
/** 好友资料 */
export interface FriendInfo extends StrangerInfo {
    readonly remark: string //好友备注
}
/** 群资料 */
export interface GroupInfo {
    readonly group_id: number, //群号
    readonly group_name: string, //群名
    readonly member_count: number, //群员数
    readonly max_member_count: number, //最大群员数
    readonly owner_id: number, //群主账号
    readonly last_join_time: number, //最后入群时间
    readonly last_sent_time: number, //最后发言时间
    readonly shutup_time_whole: number, //全员禁言到期时间
    readonly shutup_time_me: number, //我的禁言到期时间
    readonly create_time: number, //创建时间
    readonly grade: number, //群等级
    readonly max_admin_count: number, //最大管理员数
    readonly active_member_count: number, //活跃群员数
    readonly update_time: number, //当前群资料的最后更新时间
}
/** 群员基础资料 */
export interface MemberBaseInfo {
    readonly user_id: number,
    readonly nickname: string,
    readonly card: string, //群名片
    readonly sex: Gender,
    readonly age: number,
    readonly area: string,
    readonly level: number, //等级
    readonly role: GroupRole, //权限
    readonly title: string, //头衔
}
/** 群员资料 */
export interface MemberInfo extends MemberBaseInfo {
    readonly group_id: number,
    // readonly user_id: number,
    // readonly nickname: string,
    // readonly card: string,
    // readonly sex: Gender,
    // readonly age: number,
    // readonly area: string,
    readonly join_time: number, //入群时间
    readonly last_sent_time: number, //最后发言时间
    // readonly level: number,
    readonly rank: string,
    // readonly role: GroupRole,
    /** @deprecated */
    readonly unfriendly: boolean,
    // readonly title: string,
    readonly title_expire_time: number, //头衔过期时间
    /** @deprecated */
    readonly card_changeable: boolean,
    readonly shutup_time: number, //禁言到期时间
    readonly update_time: number, //此群员资料的最后更新时间
}

////////// Message Elements

/**
 * 使用cqhttp风格的消息元素类型
 * @see https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md 在此基础上进行了扩展
 */
export type MessageElem = TextElem | AtElem | FaceElem | BfaceElem | MfaceElem |
    ImgPttElem | LocationElem | MusicElem | ShareElem | JsonElem | XmlElem |
    AnonymousElem | ReplyElem | NodeElem | ShakeElem | PokeElem | FileElem | VideoElem | MiraiElem;

/** 一般文本 */
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
        text?: string, //at失败时显示的文本
        dummy?: boolean, //假at
    }
}

/** 经典表情 */
export interface FaceElem {
    type: "face" | "sface",
    data: {
        id: number,
        text?: string
    }
}

/** 原创表情 */
export interface BfaceElem {
    type: "bface",
    data: {
        file: string,
        text: string
    }
}

/** 魔法表情 */
export interface MfaceElem {
    type: "rps" | "dice", //猜拳和骰子
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

/** 图片，闪照，语音 */
export interface ImgPttElem {
    type: "image" | "flash" | "record",
    data: {
        file: MediaFile,
        cache?: boolean, //file为网络资源时是否使用缓存
        timeout?: number, //file为网络资源时请求超时时间
        headers?: OutgoingHttpHeaders, //file为网络资源时请求头
        url?: string, //仅接收
    }
}

/** 视频 */
export interface VideoElem {
    type: "video",
    data: {
        file: string, //发送仅支持本地文件路径或转发
        url?: string, //仅接收
    }
}

/** 地点分享 */
export interface LocationElem {
    type: "location",
    data: {
        address: string,
        lat: number, //经纬度
        lng: number, //经纬度
        name?: string,
        id?: string,
    }
}

export type MusicType = "qq" | "163" | "migu" | "kugou" | "kuwo";
/** 音乐分享 */
export interface MusicElem {
    type: "music",
    data: {
        type: MusicType,
        id: string,
    }
}

/** 链接分享 */
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

/** 匿名消息 */
export interface AnonymousElem {
    type: "anonymous",
    data?: {
        ignore?: boolean, //匿名失败时是否继续发送，default: true
    }
}

/** 回复 */
export interface ReplyElem {
    type: "reply",
    data: {
        id: string, //message_id
    }
}

export interface NodeElem {
    type: "node",
    data: {
        id: string,
    }
}

/** 窗口抖动 */
export interface ShakeElem {
    type: "shake",
}

/** 戳一戳 */
export interface PokeElem {
    type: "poke",
    data: {
        type: number, //0~6
        id?: number,
    }
}

/** 该元素仅mirai系的客户端可解析，官方客户端无法识别 */
export interface MiraiElem {
    type: "mirai",
    data: {
        data: string,
    }
}

/** 文件(仅接受) */
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
    post_type: "system" | "request" | "message" | "notice" | "sync" | string,
    sub_type?: string,
}

// system events
export interface CommonSystemEventData extends CommonEventData {
    post_type: "system",
}
export interface QrcodeEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "qrcode", //收到二维码
    image: Buffer,
}
export interface SliderEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "slider", //收到滑动验证码
    url: string, //滑动地址
}
export interface DeviceEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "device", //收到设备锁验证请求
    url: string, //验证地址
    phone: string, //密保手机
}
export interface LoginErrorEventData extends CommonSystemEventData {
    system_type: "login",
    sub_type: "error", //登录遇到错误
    code: number, //错误码
    message: string, //错误消息
}
export interface OnlineEventData extends CommonSystemEventData {
    system_type: "online", //上线
}
export interface OfflineEventData extends CommonSystemEventData {
    system_type: "offline", //掉线
    sub_type: "network" | "kickoff" | "frozen" | "unknown",
    message: string, //掉线原因
}

// request events
interface CommonRequestEventData extends CommonEventData {
    post_type: "request",
    user_id: number,
    nickname: string,
    flag: string, //同意或拒绝时传入
}
export interface FriendAddEventData extends CommonRequestEventData {
    request_type: "friend",
    sub_type: "add" | "single", //加好友请求
    comment: string, //附加信息
    source: string, //来源(如"条件查找")
    age: number,
    sex: Gender,
}
export interface GroupAddEventData extends CommonRequestEventData {
    request_type: "group",
    sub_type: "add", //加群请求
    group_id: number,
    group_name: string,
    comment: string, //附加信息
    inviter_id?: number, //邀请者(来自群员的邀请时)
    tips: string, //如"该帐号存在风险，请谨慎操作"
}
export interface GroupInviteEventData extends CommonRequestEventData {
    request_type: "group",
    sub_type: "invite", //群邀请
    group_id: number,
    group_name: string,
    role: GroupRole, //邀请者权限
}

// message events
interface CommonMessageEventData extends CommonEventData {
    post_type: "message",
    message: MessageElem[], //消息链
    raw_message: string, //字符串格式的消息
    message_id: string,
    user_id: number,
    font: string,
    reply: (message: MessageElem | Iterable<MessageElem> | string, auto_escape?: boolean) => Promise<Ret<{ message_id: string }>>,
}
export interface PrivateMessageEventData extends CommonMessageEventData {
    message_type: "private", //私聊消息
    sub_type: "friend" | "group" | "single" | "other" | "self",
    sender: FriendInfo,
    auto_reply: boolean, //是否自动回复
}
export interface GroupMessageEventData extends CommonMessageEventData {
    message_type: "group", //群消息
    sub_type: "normal" | "anonymous",
    group_id: number,
    group_name: string,
    anonymous: Anonymous | null, //匿名消息
    sender: MemberBaseInfo,
    atme: boolean,
    seqid: number,
    block: boolean, //是否已屏蔽
}
export interface Anonymous {
    id: number,
    name: string,
    flag: string,
}
export interface DiscussMessageEventData extends CommonMessageEventData {
    message_type: "discuss", //讨论组消息
    discuss_id: number,
    discuss_name: string,
    atme: boolean,
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
    sub_type: "recall", //好友消息撤回
    user_id: number, //好友号
    operator_id: number, //撤回者(好友或自己)
    message_id: string,
}
export interface FriendProfileEventData extends CommonFriendNoticeEventData {
    sub_type: "profile", //好友资料变更
    user_id: number,
    nickname?: string,
    signature?: string,
}
export interface FriendIncreaseEventData extends CommonFriendNoticeEventData {
    sub_type: "increase", //好友增加
    user_id: number,
    nickname: string,
}
export interface FriendDecreaseEventData extends CommonFriendNoticeEventData {
    sub_type: "decrease", //好友减少
    user_id: number,
    nickname: string,
}
export interface FriendPokeEventData extends CommonFriendNoticeEventData {
    sub_type: "poke", //好友戳一戳
    user_id: number, //好友号
    operator_id: number, //poke者
    target_id: number, //被poke者
    action: string, //动作名
    suffix: string, //后缀
}

interface CommonGroupNoticeEventData extends CommonEventData {
    post_type: "notice",
    notice_type: "group",
}
export interface GroupPokeEventData extends CommonGroupNoticeEventData {
    sub_type: "poke", //群戳一戳
    group_id: number, //群号
    operator_id: number, //poke者
    user_id: number, //被poke者
    target_id: number, //被poke者
    action: string, //动作名
    suffix: string, //后缀
}
export interface MemberIncreaseEventData extends CommonGroupNoticeEventData {
    sub_type: "increase", //群增加或群员增加
    group_id: number,
    user_id: number,
    nickname: string,
}
export interface MemberDecreaseEventData extends CommonGroupNoticeEventData {
    sub_type: "decrease", //群减少或群员减少
    group_id: number,
    operator_id: number, //踢人者
    user_id: number, //被踢者
    dismiss: boolean, //是否是解散
    member?: MemberInfo, //该群员的最后资料(有缓存时提供)
    group?: GroupInfo, //该群的最后资料(自己被踢或群解散时提供)
}
export interface GroupRecallEventData extends CommonGroupNoticeEventData {
    sub_type: "recall", //群消息撤回
    group_id: number,
    operator_id: number, //撤回者
    user_id: number, //被撤回者
    message_id: string,
}
export interface GroupAdminEventData extends CommonGroupNoticeEventData {
    sub_type: "admin", //管理员变更
    group_id: number,
    user_id: number,
    set: boolean,
}
export interface GroupMuteEventData extends CommonGroupNoticeEventData {
    sub_type: "ban", //群禁言
    group_id: number,
    operator_id: number, //禁言者
    user_id: number, //被禁言者(全员禁言为0)
    nickname?: string, //匿名者昵称(当user_id为80000000时提供)
    duration: number, //时长
}
export interface GroupTransferEventData extends CommonGroupNoticeEventData {
    sub_type: "transfer", //群转让
    group_id: number,
    operator_id: number, //旧群主
    user_id: number, //新群主
}
export interface GroupTitleEventData extends CommonGroupNoticeEventData {
    sub_type: "title", //群头衔变更(暂未实现该事件)
    group_id: number,
    user_id: number,
    nickname: string,
    title: string,
}
export interface GroupSettingEventData extends CommonGroupNoticeEventData {
    sub_type: "setting", //群设置变更
    group_id: number,
    group_name?: string, //群名变更
    enable_guest?: boolean, //允许游客
    enable_anonymous?: boolean, //允许匿名
    enable_upload_album?: boolean, //允许群员上传相册
    enable_upload_file?: boolean, //允许群员上传文件
    enable_temp_chat?: boolean, //允许发起临时会话
    enable_new_group?: boolean, //允许发起新群
    enable_show_honor?: boolean, //显示群员荣誉
    enable_show_level?: boolean, //显示群员等级
    enable_show_title?: boolean, //显示群员头衔
    enable_confess?: boolean, //开关坦白说
    avatar?: boolean, //头像变更
}

//sync events 同一账号的其他客户端做了某些操作而触发的事件
export interface SyncMessageEventData extends Omit<PrivateMessageEventData, "post_type" | "message_type" | "reply"> {
    post_type: "sync",
    sync_type: "message", //同步其他客户端发送的私聊
}
export interface SyncStatusEventData extends CommonEventData {
    post_type: "sync",
    sync_type: "status", //同步在线状态
    old_status: number,
    new_status: number,
}
export interface SyncProfileEventData extends CommonEventData {
    post_type: "sync",
    sync_type: "profile", //同步个人资料
    nickname?: string,
    sex?: Gender,
    age?: number,
    signature?: string,
    description?: string,
    avatar?: boolean,
}
export interface SyncReadedEventData extends CommonEventData {
    post_type: "sync",
    sync_type: "readed", //同步已读
    sub_type: "private" | "group",
    user_id?: number,
    timestamp?: number, //私聊以时间戳分界
    group_id?: number,
    seqid?: number, //群聊以seqid分界
}
export interface SyncBlackEventData extends CommonEventData {
    post_type: "sync",
    sync_type: "black", //同步黑名单
    blacklist: number[],
}

export type FriendNoticeEventData = FriendIncreaseEventData | FriendDecreaseEventData | FriendRecallEventData |
    FriendProfileEventData | FriendPokeEventData; //5
export type GroupNoticeEventData = GroupRecallEventData | GroupSettingEventData | GroupTitleEventData |
    GroupTransferEventData | GroupMuteEventData | GroupAdminEventData |
    MemberIncreaseEventData | MemberDecreaseEventData | GroupPokeEventData; //9

export type SystemEventData = DeviceEventData | SliderEventData | LoginErrorEventData | QrcodeEventData |
    OfflineEventData | OnlineEventData; //6(4+2)
export type RequestEventData = FriendAddEventData | GroupAddEventData | GroupInviteEventData; //3
export type MessageEventData = PrivateMessageEventData | GroupMessageEventData | DiscussMessageEventData; //3
export type NoticeEventData = FriendNoticeEventData | GroupNoticeEventData; //2
export type SyncEventData = SyncMessageEventData | SyncProfileEventData | SyncStatusEventData | SyncReadedEventData | SyncBlackEventData; //5
export type EventData = SystemEventData | RequestEventData | MessageEventData | NoticeEventData | SyncEventData; //5

////////// group file system

export interface GfsBaseStat {
    fid: string, //文件(夹)id
    pid: string, //父文件夹id
    name: string,
    user_id: number, //创建者
    create_time: number, //创建时间
}
export interface GfsFileStat extends GfsBaseStat {
    size: number, //文件大小(字节)
    busid: number,
    md5: string,
    sha1: string,
    duration: number, //有效时间
    download_times: number, //下载次数
}
export interface GfsDirStat extends GfsBaseStat {
    file_count: number, //文件数
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
    upload(file: MediaFile, pid?: string, name?: string, process?: (percentage: string) => void): Promise<GfsFileStat>;
    /** 获取文件的下载链接 */
    download(fid: string): Promise<FileElem["data"]>;
}

//////////

export type Domain = "tenpay.com"
    | "docs.qq.com"
    | "office.qq.com"
    | "connect.qq.com"
    | "vip.qq.com"
    | "mail.qq.com"
    | "qzone.qq.com"
    | "gamecenter.qq.com"
    | "mma.qq.com"
    | "game.qq.com"
    | "qqweb.qq.com"
    | "openmobile.qq.com"
    | "qun.qq.com"
    | "ti.qq.com";


export interface EventMap {
    /**扫码登录收到二维码事件 */
    "system.login.qrcode": (this: Client, data: QrcodeEventData) => void;
    /**收到滑动验证码事件 */
    "system.login.slider": (this: Client, data: SliderEventData) => void;
    /**设备锁验证事件 */
    "system.login.device": (this: Client, data: DeviceEventData) => void;
    /**登录遇到错误事件 */
    "system.login.error": (this: Client, data: LoginErrorEventData) => void;
    "system.login": (this: Client, data: DeviceEventData | LoginErrorEventData | SliderEventData | QrcodeEventData) => void;
    /**上线事件 */
    "system.online": (this: Client, data: OnlineEventData) => void;

    /**下线事件（网络原因） */
    "system.offline.network": (this: Client, data: OfflineEventData) => void;
    /**下线事件（被踢下线） */
    "system.offline.kickoff": (this: Client, data: OfflineEventData) => void;
    /**下线事件（账号被冻结） */
    "system.offline.frozen": (this: Client, data: OfflineEventData) => void;
    /**下线事件（未知原因） */
    "system.offline.unknown": (this: Client, data: OfflineEventData) => void;
    /**下线事件 */
    "system.offline": (this: Client, data: OfflineEventData) => void;

    "system": (this: Client, data: SystemEventData) => void;

    /**收到好友申请事件 */
    "request.friend.add": (this: Client, data: FriendAddEventData) => void;
    /**收到好友申请事件 */
    "request.friend.single": (this: Client, data: FriendAddEventData) => void;
    /**收到好友申请事件 */
    "request.friend": (this: Client, data: FriendAddEventData) => void;
    /**收到加群申请事件 */
    "request.group.add": (this: Client, data: GroupAddEventData) => void;
    /**收到群邀请事件 */
    "request.group.invite": (this: Client, data: GroupInviteEventData) => void
    "request.group": (this: Client, data: GroupAddEventData | GroupInviteEventData) => void
    /**监听以上所有request事件 */
    "request": (this: Client, data: RequestEventData) => void;

    /**私聊消息事件 */
    "message.private.friend": (this: Client, data: PrivateMessageEventData) => void;
    "message.private.group": (this: Client, data: PrivateMessageEventData) => void;
    "message.private.single": (this: Client, data: PrivateMessageEventData) => void;
    "message.private.other": (this: Client, data: PrivateMessageEventData) => void;
    "message.private.self": (this: Client, data: PrivateMessageEventData) => void;
    "message.private": (this: Client, data: PrivateMessageEventData) => void;

    /**群消息事件 */
    "message.group": (this: Client, data: GroupMessageEventData) => void;
    "message.group.normal": (this: Client, data: GroupMessageEventData) => void;
    "message.group.anonymous": (this: Client, data: GroupMessageEventData) => void;
    /**讨论组消息事件 */
    "message.discuss": (this: Client, data: DiscussMessageEventData) => void;
    /**监听以上所有message事件 */
    "message": (this: Client, data: MessageEventData) => void;

    /**新增好友事件 */
    "notice.friend.increase": (this: Client, data: FriendIncreaseEventData) => void;
    /**好友(被)删除事件 */
    "notice.friend.decrease": (this: Client, data: FriendDecreaseEventData) => void;
    /**好友消息撤回事件 */
    "notice.friend.recall": (this: Client, data: FriendRecallEventData) => void;
    /**好友资料变更事件 */
    "notice.friend.profile": (this: Client, data: FriendProfileEventData) => void;
    /**好友戳一戳事件 */
    "notice.friend.poke": (this: Client, data: FriendPokeEventData) => void;
    /**入群・群员增加事件 */
    "notice.group.increase": (this: Client, data: MemberIncreaseEventData) => void;
    /**踢群・退群事件 */
    "notice.group.decrease": (this: Client, data: MemberDecreaseEventData) => void;
    /**群消息撤回事件 */
    "notice.group.recall": (this: Client, data: GroupRecallEventData) => void;
    /**管理员变更事件 */
    "notice.group.admin": (this: Client, data: GroupAdminEventData) => void;
    /**群禁言事件 */
    "notice.group.ban": (this: Client, data: GroupMuteEventData) => void;
    /**群转让事件 */
    "notice.group.transfer": (this: Client, data: GroupTransferEventData) => void;
    /**群头衔变更事件 */
    "notice.group.title": (this: Client, data: GroupTitleEventData) => void;
    /**群戳一戳事件 */
    "notice.group.poke": (this: Client, data: GroupPokeEventData) => void;
    /**群设置变更事件 */
    "notice.group.setting": (this: Client, data: GroupSettingEventData) => void;
    /**监听以上所有好友notice事件 */
    "notice.friend": (this: Client, data: FriendNoticeEventData) => void;
    /**监听以上所有群notice事件 */
    "notice.group": (this: Client, data: GroupNoticeEventData) => void;
    /**监听以上所有notice事件 */
    "notice": (this: Client, data: NoticeEventData) => void;

    /**同账号其他客户端发送私聊事件 */
    "sync.message": (this: Client, data: SyncMessageEventData) => void;
    /**个人资料修改事件 */
    "sync.profile": (this: Client, data: SyncProfileEventData) => void;
    /**在线状态修改事件 */
    "sync.status": (this: Client, data: SyncStatusEventData) => void;
    /** @deprecated 黑名单修改事件 */
    "sync.black": (this: Client, data: SyncBlackEventData) => void;
    /**消息已读事件 */
    "sync.readed": (this: Client, data: SyncReadedEventData) => void;
    "sync.readed.private": (this: Client, data: SyncReadedEventData) => void;
    "sync.readed.group": (this: Client, data: SyncReadedEventData) => void;
    /**监听以上所有sync事件 */
    "sync": (this: Client, data: SyncEventData) => void;

    /** 实验性事件: 监听所有收到的包(已解密) */
    "internal.sso": (this: Client, data: { cmd: string, seq: number, payload: Buffer }) => void;
    /** 实验性事件: 对方正在输入 */
    "internal.input": (this: Client, data: { user_id: number, end: boolean }) => void;
}

/**
 * 方法不会reject或抛出异常，使用retcode判断是否成功
 * @see {Ret}
 */
export class Client extends EventEmitter {

    readonly uin: number;
    readonly password_md5?: Buffer;
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
    /** 黑名单 */
    readonly blacklist: ReadonlySet<number>;
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
     * @param password 明文或md5后的密码
     * 使用扫码登录，或通过设备锁验证时可无需传入此参数
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
    /** 置消息已读(message_id及之前的消息将全部变为已读) */
    reportReaded(message_id: string): Promise<Ret>;
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

    /** 发简易群公告 */
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
    /** 退群(注意dismiss参数可能无效，如果你是群主无论如何群都会立即解散) */
    setGroupLeave(group_id: number, dismiss?: boolean): Promise<Ret>;
    /** 戳一戳(可以对好友使用) */
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

    /** @deprecated 获取群公告(该方法已废弃，参考web-api.md自行获取) */
    getGroupNotice(group_id: number): Promise<Ret<any[]>>;
    /** @deprecated 获取等级信息(该方法已废弃，参考web-api.md自行获取) */
    getLevelInfo(user_id?: number): Promise<Ret<any>>;

    getCookies(domain?: Domain): Promise<Ret<{ cookies: string }>>;
    getCsrfToken(): Promise<Ret<{ token: number }>>;
    /** 清除 image 和 record 文件夹下的缓存文件 */
    cleanCache(type?: "image" | "record"): Promise<Ret>;
    /** 获取在线状态和数据统计 */
    getStatus(): Ret<Status>;

    /** 进入群文件系统 */
    acquireGfs(group_id: number): Gfs;

    on<T extends keyof EventMap>(event: T, listener: EventMap[T]): this;
    on<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: Client, ...args: any[]) => void): this;

    once<T extends keyof EventMap>(event: T, listener: EventMap[T]): this;
    once<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: Client, ...args: any[]) => void): this;

    prependListener<T extends keyof EventMap>(event: T, listener: EventMap[T]): this;
    prependListener(event: string | symbol, listener: (this: Client, ...args: any[]) => void): this;
    prependOnceListener<T extends keyof EventMap>(event: T, listener: EventMap[T]): this;
    prependOnceListener(event: string | symbol, listener: (this: Client, ...args: any[]) => void): this;

    /**
     * 重载好友列表和群列表
     * 完成之前无法调用任何api，也不会上报任何事件
     */
    reloadFriendList(): Promise<Ret>;
    reloadGroupList(): Promise<Ret>;

    /** 直接关闭连接 */
    terminate(): void;
    /** @deprecated 文字验证码 */
    captchaLogin(captcha: string): void;
    /** @deprecated */
    canSendImage(): Ret;
    /** @deprecated */
    canSendRecord(): Ret;
    /** @deprecated 获取版本信息(暂时为返回package.json中的信息) */
    getVersionInfo(): Ret<any>;
    /** @deprecated 获取登录账号信息 */
    getLoginInfo(): Ret<LoginInfo>;

    //----------以下为隐藏方法，可用于扩展协议----------\\
    /** 发送一个未加密的uni包 */
    sendUni(cmd: string, body: Uint8Array): Promise<Buffer>;
    /** 发送一个未加密的oidb包 */
    sendOidb(cmd: string, body: Uint8Array): Promise<Buffer>;
    /** 触发一个oicq标准事件 */
    em(name: string, data?: any): void;
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
    /** 视频 */
    function video(file: string): VideoElem;
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
    function video(file: string): string;
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

export namespace constants {
    const PLATFORM_ANDROID = 1;
    const PLATFORM_APAD = 2;
    const PLATFORM_WATCH = 3;
    const PLATFORM_IMAC = 4;
    const PLATFORM_IPAD = 5;
    const STATUS_ONLINE = 11;
    const STATUS_ABSENT = 31;
    const STATUS_INVISIBLE = 41;
    const STATUS_BUSY = 50;
    const STATUS_QME = 60;
    const STATUS_NODISTURB = 70;
}
