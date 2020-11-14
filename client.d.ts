// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as events from 'events';

export type Uin = string | number;

export interface ConfBot {
    log_level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "off", //默认info
    platform?: number, //1手机 2平板(默认) 3手表(不支持部分群事件)
    kickoff?: boolean, //被挤下线是否在3秒后反挤对方，默认false
    ignore_self?: boolean,//群聊是否无视自己的发言，默认true
    resend?: boolean, //被风控时是否尝试用另一种方式强行发送，默认true
    data_dir?: string, //数据存储文件夹，需要可写权限，默认主目录下的data文件夹
}

export interface RetError {
    code?: number,
    message?: string,
}
export interface RetCommon {
    retcode: number, //0ok 1async 100error 102failed 103timeout 104offline
    status: string, //"ok", "async", "failed"
    data: object | null,
    error?: RetError | null,
}

//////////

export interface StrangerInfo {
    user_id?: number,
    nickname?: string,
    sex?: string,
    age?: number,
    area?: string,
    group_id?: number,
}
export interface FriendInfo extends StrangerInfo {
    remark?: string,
    signature?: string,
    description?: string,
}
export interface GroupInfo {
    group_id?: number,
    group_name?: string,
    member_count?: number,
    max_member_count?: number,
    owner_id?: number,
    last_join_time?: number,
    last_sent_time?: number,
    shutup_time_whole?: number,
    shutup_time_me?: number,
    create_time?: number,
    grade?: number,
    max_admin_count?: number,
    active_member_count?: number,
    update_time?: number,
}
export interface MemberInfo {
    group_id?: number,
    user_id?: number,
    nickname?: string,
    card?: string,
    sex?: string,
    age?: number,
    area?: string,
    join_time?: number,
    last_sent_time?: number,
    level?: number,
    rank?: string,
    role?: string,
    unfriendly?: boolean,
    title?: string,
    title_expire_time?: number,
    card_changeable?: boolean,
    shutup_time?: number,
    update_time?: number,
}
export interface MessageId {
    message_id: string
}

export interface RetStrangerList extends RetCommon {
    data: Map<number, StrangerInfo>
}
export interface RetFriendList extends RetCommon {
    data: Map<number, FriendInfo>
}
export interface RetGroupList extends RetCommon {
    data: Map<number, GroupInfo>
}
export interface RetMemberList extends RetCommon {
    data: Map<number, MemberInfo> | null
}
export interface RetStrangerInfo extends RetCommon {
    data: StrangerInfo | null
}
export interface RetGroupInfo extends RetCommon {
    data: GroupInfo | null
}
export interface RetMemberInfo extends RetCommon {
    data: MemberInfo | null
}
export interface RetSendMsg extends RetCommon {
    data: MessageId | null
}

//////////

/**
 * @see https://github.com/howmanybots/onebot/blob/master/v11/specs/message/segment.md
 */
export interface MessageElem {
    type: string,
    data: object,
}

export interface Anonymous {
    id: number,
    name: string,
    flag: string,
}

export interface EventData {
    self_id: number,
    time: number,
    post_type: string,
    system_type?: string,
    request_type?: string,
    message_type?: string,
    notice_type?: string,
    sub_type?: string,

    image?: Buffer,
    url?: string,

    message?: MessageElem | string,
    raw_message?: string,
    message_id?: string,
    user_id?: number,
    nickname?: string,
    group_id?: number,
    group_name?: string,
    discuss_id?: number,
    discuss_name?: string,
    font?: string,
    anonymous?: Anonymous | null,
    sender?: FriendInfo & MemberInfo,
    auto_reply?: boolean,

    flag?: string,
    comment?: string,
    source?: string,
    role?: string,

    inviter_id?: number,
    operator_id?: number,
    duration?: number,
    set?: boolean,
    dismiss?: boolean,
    signature?: string,
    title?: string,
    content?: string,
    action?: string,
    suffix?: string,
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

//////////

export class Client extends events.EventEmitter {

    private constructor();
    login(password_md5?: Buffer | string): void;
    captchaLogin(captcha: string): void;
    terminate(): void; //直接关闭连接
    logout(): Promise<void>; //先下线再关闭连接
    isOnline(): boolean;

    setOnlineStatus(status: number): Promise<RetCommon>; //11我在线上 31离开 41隐身 50忙碌 60Q我吧 70请勿打扰

    getFriendList(): RetFriendList;
    getStrangerList(): RetStrangerList;
    getGroupList(): RetGroupList;
    getGroupMemberList(group_id: Uin): Promise<RetMemberList>;
    getStrangerInfo(user_id: Uin, no_cache?: boolean): Promise<RetStrangerInfo>;
    getGroupInfo(group_id: Uin, no_cache?: boolean): Promise<RetGroupInfo>;
    getGroupMemberInfo(group_id: Uin, user_id: Uin, no_cache?: boolean): Promise<RetMemberInfo>;

    sendPrivateMsg(user_id: Uin, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetSendMsg>;
    sendGroupMsg(group_id: Uin, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetSendMsg>;
    sendDiscussMsg(discuss_id: Uin, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetCommon>;
    deleteMsg(message_id: string): Promise<RetCommon>;

    sendGroupNotice(group_id: Uin, content: string): Promise<RetCommon>;
    setGroupName(group_id: Uin, group_name: string): Promise<RetCommon>;
    setGroupAnonymous(group_id: Uin, enable?: boolean): Promise<RetCommon>;
    setGroupWholeBan(group_id: Uin, enable?: boolean): Promise<RetCommon>;
    setGroupAdmin(group_id: Uin, user_id: Uin, enable?: boolean): Promise<RetCommon>;
    setGroupSpecialTitle(group_id: Uin, user_id: Uin, special_title?: string, duration?: number): Promise<RetCommon>;
    setGroupCard(group_id: Uin, user_id: Uin, card?: string): Promise<RetCommon>;
    setGroupKick(group_id: Uin, user_id: Uin, reject_add_request?: boolean): Promise<RetCommon>;
    setGroupBan(group_id: Uin, user_id: Uin, duration?: number): Promise<RetCommon>;
    setGroupLeave(group_id: Uin, is_dismiss?: boolean): Promise<RetCommon>;
    sendGroupPoke(group_id: Uin, user_id: Uin): Promise<RetCommon>;

    setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<RetCommon>;
    setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<RetCommon>;

    addGroup(group_id: Uin, comment?: string): Promise<RetCommon>;
    addFriend(group_id: Uin, user_id: Uin, comment?: string): Promise<RetCommon>;
    deleteFriend(user_id: Uin, block?: boolean): Promise<RetCommon>;
    inviteFriend(group_id: Uin, user_id: Uin): Promise<RetCommon>;
    sendLike(user_id: Uin, times?: number): Promise<RetCommon>;
    setNickname(nickname: string): Promise<RetCommon>;
    setGender(gender: 0 | 1 | 2): Promise<RetCommon>; //0未知 1男 2女
    setBirthday(birthday: string | number): Promise<RetCommon>; //20110202的形式
    setDescription(description?: string): Promise<RetCommon>;
    setSignature(signature?: string): Promise<RetCommon>;
    setPortrait(file: Buffer | string): Promise<RetCommon>; //图片CQ码中file相同格式
    setGroupPortrait(group_id: Uin, file: Buffer | string): Promise<RetCommon>;

    getCookies(domain?: string): Promise<RetCommon>;
    getCsrfToken(): Promise<RetCommon>;
    cleanCache(type?: string): Promise<RetCommon>;
    canSendImage(): RetCommon;
    canSendRecord(): RetCommon;
    getVersionInfo(): RetCommon;
    getStatus(): RetCommon;
    getLoginInfo(): RetCommon;

    once(event: "system" | "request" | "message" | "notice", listener: (data: EventData) => void): this;
    on(event: "system" | "request" | "message" | "notice", listener: (data: EventData) => void): this;
    off(event: "system" | "request" | "message" | "notice", listener: (data: EventData) => void): this;
    once(event: string, listener: (data: EventData) => void): this;
    on(event: string, listener: (data: EventData) => void): this;
    off(event: string, listener: (data: EventData) => void): this;
}

export function createClient(uin: Uin, config?: ConfBot): Client;
