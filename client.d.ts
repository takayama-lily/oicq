// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as events from 'events';

interface ConfGlobal {
    web_image_timeout?: number, //下载的超时秒数，默认系统自己判断
    web_record_timeout?: number,
    cache_root?: string, //数据文件夹路径，需要可写权限，默认主目录下data文件夹
    debug?: boolean,
}

declare enum Platform {
    phone = 1,  //手机
    pad = 2,    //平板
    watch = 3,  //手表，不支持部分群事件
}
interface ConfBot {
    log_level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "off", //默认info
    platform?: Platform, //默认平板
    kickoff?: boolean, //被挤下线是否在3秒后反挤对方，默认false
    ignore_self?: boolean,//群聊是否无视自己的发言，默认true
}

//////////

declare enum Retcode {
    ok = 0,
    async = 1,
    error = 100,
    failed = 102,
    timeout = 103,
    offline = 104,
}
interface RetErrorObj {
    code?: number,
    message?: string,
}
interface RetCommon {
    retcode: Retcode,
    status: "ok" | "async" | "failed",
    data: object | null,
    error?: RetErrorObj,
}

//////////

interface StrangerInfo {
    user_id?: number,
    nickname?: string,
    sex?: "unknown" | "male" | "female",
    age?: number,
    area?: string,
}
interface FriendInfo extends StrangerInfo {
    remark?: string,
    signature?: string,
    description?: string,
}
interface GroupInfo {
    group_id?: number,
    group_name?: string,
    member_count?: number,
    max_member_count?: number,
    owner_id?: number,
    last_join_time?: number,
    last_sent_time?: number,
    shutup_time_whole?: 0 | -1,
    shutup_time_me?: number,
    create_time?: number,
    grade?: number,
    max_admin_count?: number,
    active_member_count?: number,
    update_time?: number,
}
interface MemberInfo {
    group_id?: number,
    user_id?: number,
    nickname?: string,
    card?: string,
    sex?: "unknown" | "male" | "female",
    age?: number,
    area?: string,
    join_time?: number,
    last_sent_time?: number,
    level?: number,
    rank?: string,
    role?: "owner" | "admin" | "member",
    unfriendly?: boolean,
    title?: string,
    title_expire_time?: number,
    card_changeable?: boolean,
    update_time?: number,
}
interface MessageId {
    message_id: string
}

interface RetStrangerList extends RetCommon {
    data: Map<number, StrangerInfo>
}
interface RetFriendList extends RetCommon {
    data: Map<number, FriendInfo>
}
interface RetGroupList extends RetCommon {
    data: Map<number, GroupInfo>
}
interface RetMemberList extends RetCommon {
    data: Map<number, MemberInfo> | null
}
interface RetStrangerInfo extends RetCommon {
    data: StrangerInfo | null
}
interface RetGroupInfo extends RetCommon {
    data: GroupInfo | null
}
interface RetMemberInfo extends RetCommon {
    data: MemberInfo | null
}
interface RetSendMsg extends RetCommon {
    data: MessageId | null
}

//////////

interface MessageElem {
    type: string,
    data: object,
}

interface Anonymous {
    id: number,
    name: string,
    flag: string,
}

interface GroupFile {
    name: string,
    url: string,
    size: number,
    md5: string,
    duration: number,
}

interface EventData {
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

    flag?: string,
    comment?: string,
    source?: string,
    role?: string,

    operator_id?: number,
    duration?: number,
    set?: boolean,
    dismiss?: boolean,
    signature?: string,
    title?: string,
    content?: string,
    action?: string,
    suffix?: string,
    file?: GroupFile,
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

declare class AndroidClient extends events.EventEmitter {

    login(password_md5?: Buffer | string): void;
    captchaLogin(captcha: string): void;
    terminate(): void;
    isOnline(): boolean;

    getFriendList(): RetFriendList;
    getStrangerList(): RetStrangerList;
    getGroupList(): RetGroupList;
    getGroupMemberList(group_id: number): Promise<RetMemberList>;
    getStrangerInfo(user_id: number, no_cache?: boolean): Promise<RetStrangerInfo>;
    getGroupInfo(group_id: number, no_cache?: boolean): Promise<RetGroupInfo>;
    getGroupMemberInfo(group_id: number, user_id: number, no_cache?: boolean): Promise<RetMemberInfo>;

    sendPrivateMsg(user_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetSendMsg>;
    sendGroupMsg(group_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetSendMsg>;
    sendDiscussMsg(discuss_id: number, message: MessageElem[] | string, auto_escape?: boolean): Promise<RetCommon>;
    deleteMsg(message_id: string): Promise<RetCommon>;

    sendGroupNotice(group_id: number, content: string): Promise<RetCommon>;
    setGroupName(group_id: number, group_name: string): Promise<RetCommon>;
    setGroupAdmin(group_id: number, user_id: number, enable?: boolean): Promise<RetCommon>;
    setGroupSpecialTitle(group_id: number, user_id: number, special_title?: string, duration?: number): Promise<RetCommon>;
    setGroupCard(group_id: number, user_id: number, card?: string): Promise<RetCommon>;
    setGroupKick(group_id: number, user_id: number, reject_add_request?: boolean): Promise<RetCommon>;
    setGroupBan(group_id: number, user_id: number, duration?: number): Promise<RetCommon>;
    setGroupLeave(group_id: number, is_dismiss?: boolean): Promise<RetCommon>;
    sendGroupPoke(group_id: number, user_id: number): Promise<RetCommon>;

    setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<RetCommon>;
    setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<RetCommon>;

    addGroup(group_id: number): Promise<RetCommon>;
    addFriend(group_id: number, user_id: number, comment?: string): Promise<RetCommon>;
    deleteFriend(user_id: number, block?: boolean): Promise<RetCommon>;
    inviteFriend(group_id: number, user_id: number): Promise<RetCommon>;
    sendLike(user_id: number, times?: number): Promise<RetCommon>;
    setNickname(nickname: string): Promise<RetCommon>;
    setGender(gender: 0 | 1 | 2): Promise<RetCommon>;
    setBirthday(birthday: string | number): Promise<RetCommon>; //20110202的形式
    setDescription(description?: string): Promise<RetCommon>;
    setSignature(signature?: string): Promise<RetCommon>;

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

declare namespace oicq {
    function createClient(uin: number, config?: ConfBot): AndroidClient;
    function setGlobalConfig(config?: ConfGlobal): void;
}

export = oicq;
