import { Gender, GroupRole } from "./common"
import { PrivateMessage, GroupMessage, DiscussMessage, Sendable } from "./message"
import { GuildMessageEvent } from "./internal/guild"
import { Friend } from "./friend"
import { Group, Discuss } from "./group"
import { Member } from "./member"
import { MemberInfo } from "./entities"
import { LoginErrorCode } from "./errors"

/** 发消息的返回值 */
export interface MessageRet {
	message_id: string
	seq: number
	rand: number
	time: number
}

export interface MessageEvent {
	/**
	 * 快速回复
	 * @param quote 引用这条消息(默认false)
	 */
	reply(content: Sendable, quote?: boolean): Promise<MessageRet>
}

/** 私聊消息事件 */
export interface PrivateMessageEvent extends PrivateMessage, MessageEvent {
	/** 好友对象 */
	friend: Friend
}
/** 群消息事件 */
export interface GroupMessageEvent extends GroupMessage, MessageEvent {
	/** 快速撤回 */
	recall(): Promise<boolean>
	/** 群对象 */
	group: Group
	/** 发送者群员对象 */
	member: Member
}
/** 讨论组消息事件 */
export interface DiscussMessageEvent extends DiscussMessage, MessageEvent {
	discuss: Discuss
}

export interface RequestEvent {
	post_type: "request"
	user_id: number
	nickname: string
	/** @cqhttp cqhttp方法用 */
	flag: string
	seq: number
	time: number
	/** 快速操作方法 */
	approve(yes?: boolean): Promise<boolean>
}
/** 好友申请 */
export interface FriendRequestEvent extends RequestEvent {
	request_type: "friend"
	/** 为single时对方已将你加为单向好友 */
	sub_type: "add" | "single"
	comment: string
	source: string
	age: number
	sex: Gender
}
/** 群申请 */
export interface GroupRequestEvent extends RequestEvent {
	request_type: "group"
	sub_type: "add"
	group_id: number
	group_name: string
	comment: string
	inviter_id?: number
	tips: string
}
/** 群邀请 */
export interface GroupInviteEvent extends RequestEvent {
	request_type: "group"
	sub_type: "invite"
	group_id: number
	group_name: string
	/** 邀请者在群里的权限 */
	role: GroupRole
}

/** 好友通知共通属性 */
export interface FriendNoticeEvent {
	post_type: "notice"
	notice_type: "friend"
	/** 对方账号 */
	user_id: number
	/** 好友对象 */
	friend: Friend
}
/** 好友增加 */
export interface FriendIncreaseEvent extends FriendNoticeEvent {
	sub_type: "increase"
	nickname: string
}
/** 好友减少 */
export interface FriendDecreaseEvent extends FriendNoticeEvent {
	sub_type: "decrease"
	nickname: string
}
/** 好友消息撤回 */
export interface FriendRecallEvent extends FriendNoticeEvent {
	sub_type: "recall"
	operator_id: number
	/** @cqhttp cqhttp方法用 */
	message_id: string
	seq: number
	rand: number
	time: number
}
/** 好友戳一戳 */
export interface FriendPokeEvent extends FriendNoticeEvent {
	sub_type: "poke"
	operator_id: number
	target_id: number
	action: string
	suffix: string
}

/** 群通知共通属性 */
export interface GroupNoticeEvent {
	post_type: "notice"
	notice_type: "group"
	/** 群号 */
	group_id: number
	/** 群对象 */
	group: Group
}
/** 群员增加 */
export interface MemberIncreaseEvent extends GroupNoticeEvent {
	sub_type: "increase"
	user_id: number
	nickname: string
}
/** 群员减少 */
export interface MemberDecreaseEvent extends GroupNoticeEvent {
	sub_type: "decrease"
	operator_id: number
	user_id: number
	dismiss: boolean
	member?: MemberInfo
}
/** 群消息撤回 */
export interface GroupRecallEvent extends GroupNoticeEvent {
	sub_type: "recall"
	user_id: number
	operator_id: number
	/** @cqhttp cqhttp方法用 */
	message_id: string
	seq: number
	rand: number
	time: number
}
/** 群戳一戳 */
export interface GroupPokeEvent extends GroupNoticeEvent {
	sub_type: "poke"
	/** @deprecated 群中该值永远等于target_id */
	user_id: number
	operator_id: number
	target_id: number
	action: string
	suffix: string
}
/** 管理员变更 */
export interface GroupAdminEvent extends GroupNoticeEvent {
	sub_type: "admin"
	user_id: number
	set: boolean
}
/** 群禁言 */
export interface GroupMuteEvent extends GroupNoticeEvent {
	sub_type: "ban"
	operator_id: number
	user_id: number
	duration: number
	/** 匿名禁言才有此属性 */
	nickname?: string
}
/** 群转让 */
export interface GroupTransferEvent extends GroupNoticeEvent {
	sub_type: "transfer"
	operator_id: number
	user_id: number
}

/** 事件地图 */
export interface EventMap<T = any> {

	/** 收到二维码 */
	"system.login.qrcode": (this: T, event: { image: Buffer }) => void
	/** 收到滑动验证码 */
	"system.login.slider": (this: T, event: { url: string }) => void
	/** 设备锁验证事件 */
	"system.login.device": (this: T, event: { url: string, phone: string }) => void
	/** 登录遇到错误 */
	"system.login.error": (this: T, event: { code: LoginErrorCode | number, message: string }) => void
	/** 上线事件 */
	"system.online": (this: T, event: undefined) => void

	/**下线事件（网络原因，默认自动重连） */
	"system.offline.network": (this: T, event: { message: string }) => void
	/**下线事件（服务器踢） */
	"system.offline.kickoff": (this: T, event: { message: string }) => void
	"system.offline": (this: T, event: { message: string }) => void

	//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

	/** 好友申请 */
	"request.friend.add": (this: T, event: FriendRequestEvent) => void
	/** 对方已将你加为单向好友，可回添对方 */
	"request.friend.single": (this: T, event: FriendRequestEvent) => void

	"request.friend": (this: T, event: FriendRequestEvent) => void

	/** 加群申请 */
	"request.group.add": (this: T, event: GroupRequestEvent) => void
	/** 群邀请 */
	"request.group.invite": (this: T, event: GroupInviteEvent) => void

	"request.group": (this: T, event: GroupRequestEvent | GroupInviteEvent) => void

	/** 所有request */
	"request": (this: T, event: FriendRequestEvent | GroupRequestEvent | GroupInviteEvent) => void

	//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

	/** 所有私聊消息 */
	"message.private": (this: T, event: PrivateMessageEvent) => void
	/** 从好友 */
	"message.private.friend": (this: T, event: PrivateMessageEvent) => void
	/** 从群临时会话 */
	"message.private.group": (this: T, event: PrivateMessageEvent) => void
	/** 从其他途径 */
	"message.private.other": (this: T, event: PrivateMessageEvent) => void
	/** 从我的设备 */
	"message.private.self": (this: T, event: PrivateMessageEvent) => void

	/** 所有群消息 */
	"message.group": (this: T, event: GroupMessageEvent) => void
	/** 普通群消息 */
	"message.group.normal": (this: T, event: GroupMessageEvent) => void
	/** 匿名群消息 */
	"message.group.anonymous": (this: T, event: GroupMessageEvent) => void

	/** 讨论组消息 */
	"message.discuss": (this: T, event: DiscussMessageEvent) => void

	/** 所有消息 */
	"message": (this: T, event: PrivateMessageEvent | GroupMessageEvent | DiscussMessageEvent) => void

	//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

	/** 新增好友事件 */
	"notice.friend.increase": (this: T, event: FriendIncreaseEvent) => void
	/** 好友(被)删除事件 */
	"notice.friend.decrease": (this: T, event: FriendDecreaseEvent) => void
	/** 好友消息撤回事件 */
	"notice.friend.recall": (this: T, event: FriendRecallEvent) => void
	/** 好友戳一戳事件 */
	"notice.friend.poke": (this: T, event: FriendPokeEvent) => void
	/** 入群・群员增加事件 */
	"notice.group.increase": (this: T, event: MemberIncreaseEvent) => void
	/** 踢群・退群事件 */
	"notice.group.decrease": (this: T, event: MemberDecreaseEvent) => void
	/** 群消息撤回事件 */
	"notice.group.recall": (this: T, event: GroupRecallEvent) => void
	/** 管理员变更事件 */
	"notice.group.admin": (this: T, event: GroupAdminEvent) => void
	/** 群禁言事件 */
	"notice.group.ban": (this: T, event: GroupMuteEvent) => void
	/** 群转让事件 */
	"notice.group.transfer": (this: T, event: GroupTransferEvent) => void
	/** 群戳一戳事件 */
	"notice.group.poke": (this: T, event: GroupPokeEvent) => void
	/** 所有好友notice事件 */
	"notice.friend": (this: T, event: FriendIncreaseEvent | FriendDecreaseEvent | FriendRecallEvent | FriendPokeEvent) => void
	/** 所有群notice事件 */
	"notice.group": (this: T, event: MemberIncreaseEvent | MemberDecreaseEvent | GroupRecallEvent | GroupAdminEvent | GroupMuteEvent | GroupTransferEvent | GroupPokeEvent) => void
	/** 所有notice事件 */
	"notice": (this: T, event: Parameters<EventMap["notice.friend"]>[0] | Parameters<EventMap["notice.group"]>[0]) => void

	//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

	/** 私聊同步 */
	"sync.message": (this: T, event: PrivateMessage) => void

	/** 消息已读同步 */
	"sync.read.private": (this: T, event: { user_id: number, time: number }) => void
	"sync.read.group": (this: T, event: { group_id: number, seq: number }) => void
	"sync.read": (this: T, event: { user_id: number, time: number } | { group_id: number, seq: number }) => void

	/** 隐藏事件: 监听所有收到的包 */
	"internal.sso": (this: T, cmd: string, payload: Buffer, seq: number) => void
	/** 隐藏事件: 对方正在输入 */
	"internal.input": (this: T, event: { user_id: number, end: boolean }) => void

	/** 频道相关: 频道消息 */
	"guild.message": (this: T, event: GuildMessageEvent) => void
}
