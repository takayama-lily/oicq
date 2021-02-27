// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as events from 'events';
import { OutgoingHttpHeaders } from 'http';
import * as log4js from 'log4js';

export type Uin = number;

// 大多数情况下你无需关心这些配置项，因为默认配置就是最常用的，除非你需要一些与默认不同的规则
export interface ConfBot {

    //日志等级，默认info，若消息量巨大可设置为"warn"屏蔽一般消息日志
    log_level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark" | "off",

    //1:安卓手机(默认) 2:aPad 3:安卓手表 4:MacOS(实验性) 5:iPad(实验性)
    platform?: number,

    //被踢下线是否在3秒后重新登陆，默认false
    kickoff?: boolean,

    //群聊是否无视自己的发言，默认true
    ignore_self?: boolean,

    //被风控时是否尝试用分片发送，默认true
    resend?: boolean,

    //数据存储文件夹，需要可写权限，默认主目录下的data文件夹
    data_dir?: string,

    //触发system.offline.network事件后的重连间隔秒数，默认5(秒)，不建议设置低于3(秒)
    //瞬间的断线重连不会触发此事件，通常你的机器真的没有网络或登陆无响应时才会触发
    //设置为0则不会自动重连，然后你可以监听此事件自己处理
    reconn_interval?: number,

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
    code?: number,
    message?: string,
}
export interface RetCommon<T = null> {
    retcode: 0 | 1 | 100 | 102 | 103 | 104, //0ok 1async 100error 102failed 103timeout 104offline
    status: "ok" | "async" | "failed",
    data: T | null,
    error: RetError | null,
}

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

export interface ImgPttElem {
    type: "image" | "flash" | "record",
    data: {
        file: string | Buffer | Uint8Array,
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

export interface MusicElem {
    type: "music",
    data: {
        type: "qq" | "163",
        id: number,
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

export interface CaptchaEventData extends CommonEventData {
    image: Buffer
}
export interface DeviceEventData extends CommonEventData {
    url: string
}
export interface LoginErrorEventData extends CommonEventData {
    code: number,
    message: string,
}
export interface OfflineEventData extends CommonEventData {
    message: string,
}

interface RequestEventData extends CommonEventData {
    user_id: number,
    nickname: string,
    flag: string,
}
export interface FriendAddEventData extends RequestEventData {
    comment: string,
    source: string,
    age: number,
    sex: Gender,
}
export interface GroupAddEventData extends RequestEventData {
    group_id: number,
    group_name: string,
    comment: string,
    inviter_id?: number,
}
export interface GroupInviteEventData extends RequestEventData {
    group_id: number,
    group_name: string,
    role: GroupRole,
}

interface MessageEventData extends CommonEventData {
    message: MessageElem[],
    raw_message: string,
    message_id: string,
    user_id: number,
    font: string,
}
export interface PrivateMessageEventData extends MessageEventData {
    sender: FriendInfo,
    auto_reply: boolean,
}
export interface GroupMessageEventData extends MessageEventData {
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
export interface DiscussMessageEventData extends MessageEventData {
    discuss_id: number,
    discuss_name: string,
    sender: {
        user_id: number,
        nickname: string,
        card: string,
    },
}

export interface FriendRecallEventData extends CommonEventData {
    user_id: number,
    message_id: string,
}
export interface FriendProfileEventData extends CommonEventData {
    user_id: number,
    nickname?: string,
    signature?: string,
}
export interface FriendEventData extends CommonEventData {
    user_id: number,
    nickname: string,
}
export interface FriendPokeEventData extends FriendEventData {
    action: string,
    suffix: string
}
export interface GroupPokeEventData extends FriendPokeEventData {
    group_id: number
}
export interface MemberIncreaseEventData extends FriendEventData {
    group_id: number
}
export interface MemberDecreaseEventData extends CommonEventData {
    group_id: number,
    operator_id: number,
    user_id: number,
    dismiss: boolean,
    member?: MemberInfo,
}
export interface GroupRecallEventData extends FriendEventData {
    group_id: number,
    operator_id: number
}
export interface GroupAdminEventData extends CommonEventData {
    group_id: number,
    user_id: number,
    set: boolean,
}
export interface GroupMuteEventData extends CommonEventData {
    group_id: number,
    operator_id: number,
    user_id: number,
    nickname?: string,
    duration: number,
}
export interface GroupTransferEventData extends CommonEventData {
    group_id: number,
    operator_id: number,
    user_id: number,
}
export interface GroupTitleEventData extends CommonEventData {
    group_id: number,
    user_id: number,
    nickname: string,
    title: string,
}

export interface GroupSettingEventData extends CommonEventData {
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

export type FriendNoticeEventData = FriendEventData | FriendRecallEventData | FriendProfileEventData | FriendPokeEventData;
export type GroupNoticeEventData = GroupRecallEventData | GroupSettingEventData | GroupTitleEventData | GroupTransferEventData |
    GroupMuteEventData | GroupAdminEventData | MemberIncreaseEventData | MemberDecreaseEventData;

export type EventData = CaptchaEventData | DeviceEventData | LoginErrorEventData | OfflineEventData |
    FriendAddEventData | GroupAddEventData | GroupInviteEventData |
    PrivateMessageEventData | GroupMessageEventData | DiscussMessageEventData |
    FriendNoticeEventData | GroupNoticeEventData;

//////////

export class Client extends events.EventEmitter {

    private constructor();

    readonly uin: number;
    readonly password_md5: Buffer;
    readonly nickname: string;
    readonly sex: Gender;
    readonly age: number;
    readonly online_status: number;
    readonly fl: ReadonlyMap<number, FriendInfo>;
    readonly sl: ReadonlyMap<number, StrangerInfo>;
    readonly gl: ReadonlyMap<number, GroupInfo>;
    readonly gml: ReadonlyMap<number, ReadonlyMap<number, MemberInfo>>;
    readonly logger: log4js.Logger;
    readonly dir: string;
    readonly config: ConfBot;
    readonly stat: Statistics;

    login(password?: Buffer | string): void; //密码支持明文和md5
    captchaLogin(captcha: string): void;
    sliderLogin(ticket: string): void;
    terminate(): void; //直接关闭连接
    logout(): Promise<void>; //先下线再关闭连接
    isOnline(): boolean;

    setOnlineStatus(status: 11 | 31 | 41 | 50 | 60 | 70): Promise<RetCommon>; //11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰

    getFriendList(): RetCommon<ReadonlyMap<number, FriendInfo>>;
    getStrangerList(): RetCommon<ReadonlyMap<number, StrangerInfo>>;
    getGroupList(): RetCommon<ReadonlyMap<number, GroupInfo>>;
    getGroupMemberList(group_id: number, no_cache?: boolean): Promise<RetCommon<ReadonlyMap<number, MemberInfo>>>;
    getStrangerInfo(user_id: number, no_cache?: boolean): Promise<RetCommon<StrangerInfo>>;
    getGroupInfo(group_id: number, no_cache?: boolean): Promise<RetCommon<GroupInfo>>;
    getGroupMemberInfo(group_id: number, user_id: number, no_cache?: boolean): Promise<RetCommon<MemberInfo>>;

    sendPrivateMsg(user_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetCommon<{ message_id: string }>>;
    sendGroupMsg(group_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetCommon<{ message_id: string }>>;
    sendDiscussMsg(discuss_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetCommon>;
    deleteMsg(message_id: string): Promise<RetCommon>;
    getMsg(message_id: string): Promise<RetCommon<PrivateMessageEventData | GroupMessageEventData>>;

    sendGroupNotice(group_id: number, content: string): Promise<RetCommon>;
    setGroupName(group_id: number, group_name: string): Promise<RetCommon>;
    setGroupAnonymous(group_id: number, enable?: boolean): Promise<RetCommon>;
    setGroupWholeBan(group_id: number, enable?: boolean): Promise<RetCommon>;
    setGroupAdmin(group_id: number, user_id: number, enable?: boolean): Promise<RetCommon>;
    setGroupSpecialTitle(group_id: number, user_id: number, special_title?: string, duration?: number): Promise<RetCommon>;
    setGroupCard(group_id: number, user_id: number, card?: string): Promise<RetCommon>;
    setGroupKick(group_id: number, user_id: number, reject_add_request?: boolean): Promise<RetCommon>;
    setGroupBan(group_id: number, user_id: number, duration?: number): Promise<RetCommon>;
    setGroupAnonymousBan(group_id: number, flag: string, duration?: number): Promise<RetCommon>;
    setGroupLeave(group_id: number, is_dismiss?: boolean): Promise<RetCommon>;
    sendGroupPoke(group_id: number, user_id: number): Promise<RetCommon>; //group_id是好友时可以私聊戳一戳(命名可能会在之后改进)

    setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<RetCommon>;
    setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<RetCommon>;

    addGroup(group_id: number, comment?: string): Promise<RetCommon>;
    addFriend(group_id: number, user_id: number, comment?: string): Promise<RetCommon>;
    deleteFriend(user_id: number, block?: boolean): Promise<RetCommon>;
    inviteFriend(group_id: number, user_id: number): Promise<RetCommon>;
    sendLike(user_id: number, times?: number): Promise<RetCommon>;
    setNickname(nickname: string): Promise<RetCommon>;
    setGender(gender: 0 | 1 | 2): Promise<RetCommon>; //0未知 1男 2女
    setBirthday(birthday: string | number): Promise<RetCommon>; //20110202的形式
    setDescription(description?: string): Promise<RetCommon>;
    setSignature(signature?: string): Promise<RetCommon>;
    setPortrait(file: Buffer | string): Promise<RetCommon>; //图片CQ码中file相同格式
    setGroupPortrait(group_id: number, file: Buffer | string): Promise<RetCommon>;

    // getFile(fileid: string, busid?: string): Promise<RetCommon<FileElem["data"]>>; //用于下载链接失效后重新获取
    // getChatHistory(message_id: string, num?: number): Promise<RetCommon<PrivateMessageEventData[] | GroupMessageEventData[]>>; //获取msgid往前的num条消息
    // uploadC2CImages(user_id: number, images: ImgPttElem["data"][]): Promise<RetCommon<ImgPttElem["data"][]>>; //上传好友图以备发送
    // uploadGroupImages(group_id: number, images: ImgPttElem["data"][]): Promise<RetCommon<ImgPttElem["data"][]>>; //上传群图以备发送
    // getSummaryCard(user_id: number): Promise<RetCommon<unknown>>; //查看用户资料
    // getForwardMsg(resid: string): Promise<RetCommon<unknown>>;
    // getSystemMsg(): Promise<RetCommon<Array<FriendAddEventData | GroupAddEventData | GroupInviteEventData>>>;

    getCookies(domain?: string): Promise<RetCommon<{ cookies: string }>>;
    getCsrfToken(): Promise<RetCommon<{ token: number }>>;
    cleanCache(type?: "image" | "record"): Promise<RetCommon>;
    canSendImage(): RetCommon;
    canSendRecord(): RetCommon;
    getVersionInfo(): RetCommon; //暂时为返回package.json中的信息
    getStatus(): RetCommon<Status>;
    getLoginInfo(): RetCommon<LoginInfo>;

    on(event: "system.login.captcha", listener: (this: Client, data: CaptchaEventData) => void): this;
    on(event: "system.login.device" | "system.login.slider", listener: (this: Client, data: DeviceEventData) => void): this;
    on(event: "system.login.error", listener: (this: Client, data: LoginErrorEventData) => void): this;
    on(event: "system.login", listener: (this: Client, data: CaptchaEventData | DeviceEventData | LoginErrorEventData) => void): this;
    on(event: "system.online", listener: (this: Client, data: CommonEventData) => void): this;
    on(event: "system.offline" | "system.offline.network" | "system.offline.kickoff" |
        "system.offline.frozen" | "system.offline.device" | "system.offline.unknown", listener: (this: Client, data: OfflineEventData) => void): this;
    on(event: "system", listener: (this: Client, data: CaptchaEventData | DeviceEventData | LoginErrorEventData | OfflineEventData) => void): this;

    on(event: "request.friend" | "request.friend.add", listener: (this: Client, data: FriendAddEventData) => void): this;
    on(event: "request.group.add", listener: (this: Client, data: GroupAddEventData) => void): this;
    on(event: "request.group.invite", listener: (this: Client, data: GroupInviteEventData) => void): this;
    on(event: "request.group", listener: (this: Client, data: GroupAddEventData | GroupInviteEventData) => void): this;
    on(event: "request", listener: (this: Client, data: FriendAddEventData | GroupAddEventData | GroupInviteEventData) => void): this;

    on(event: "message.private" | "message.private.friend" | "message.private.group" |
        "message.private.single" | "message.private.other", listener: (this: Client, data: PrivateMessageEventData) => void): this;
    on(event: "message.group" | "message.group.normal" | "message.group.anonymous", listener: (this: Client, data: GroupMessageEventData) => void): this;
    on(event: "message.discuss", listener: (this: Client, data: DiscussMessageEventData) => void): this;
    on(event: "message", listener: (this: Client, data: PrivateMessageEventData | GroupMessageEventData | DiscussMessageEventData) => void): this;

    on(event: "notice.friend.increase" | "notice.friend.decrease", listener: (this: Client, data: FriendEventData) => void): this;
    on(event: "notice.friend.recall", listener: (this: Client, data: FriendRecallEventData) => void): this;
    on(event: "notice.friend.profile", listener: (this: Client, data: FriendProfileEventData) => void): this;
    on(event: "notice.friend.poke", listener: (this: Client, data: FriendPokeEventData) => void): this;
    on(event: "notice.group.increase", listener: (this: Client, data: MemberIncreaseEventData) => void): this;
    on(event: "notice.group.decrease", listener: (this: Client, data: MemberDecreaseEventData) => void): this;
    on(event: "notice.group.recall", listener: (this: Client, data: GroupRecallEventData) => void): this;
    on(event: "notice.group.admin", listener: (this: Client, data: GroupAdminEventData) => void): this;
    on(event: "notice.group.ban", listener: (this: Client, data: GroupMuteEventData) => void): this;
    on(event: "notice.group.transfer", listener: (this: Client, data: GroupTransferEventData) => void): this;
    on(event: "notice.group.title", listener: (this: Client, data: GroupTitleEventData) => void): this;
    on(event: "notice.group.poke", listener: (this: Client, data: GroupPokeEventData) => void): this;
    on(event: "notice.group.setting", listener: (this: Client, data: GroupSettingEventData) => void): this;
    on(event: "notice.friend", listener: (this: Client, data: FriendNoticeEventData) => void): this;
    on(event: "notice.group", listener: (this: Client, data: GroupNoticeEventData) => void): this;
    on(event: "notice", listener: (this: Client, data: FriendNoticeEventData | GroupNoticeEventData) => void): this;

    on(event: string | symbol, listener: (this: Client, ...args: any[]) => void): this;

    //重载完成之前bot不接受其他任何请求，也不会上报任何事件
    reloadFriendList(): Promise<RetCommon>;
    reloadGroupList(): Promise<RetCommon>;
}

export function createClient(uin: number, config?: ConfBot): Client;
