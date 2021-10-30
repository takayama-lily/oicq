import { Gender, GroupRole } from "./common"
import { PrivateMessage, GroupMessage, DiscussMessage, Sendable } from "./message"
import { Friend } from "./friend"
import { Group } from "./group"
import { Member } from "./member"
import { MemberInfo } from "./entities"

/** 发消息的返回值 */
export interface MessageRet {
	message_id: string
	seq: number
	rand: number
	time: number
}

export interface MessageEvent {
	reply(content: Sendable, quote?: boolean): Promise<MessageRet>
}

/** 私聊消息事件 */
export interface PrivateMessageEvent extends PrivateMessage, MessageEvent {
	friend: Friend
}
/** 群消息事件 */
export interface GroupMessageEvent extends GroupMessage, MessageEvent {
	recall(): Promise<boolean>
	group: Group
	member: Member
}
/** 讨论组消息事件 */
export interface DiscussMessageEvent extends DiscussMessage, MessageEvent { }

/** 好友申请 */
export interface FriendAddReqEvent {
	post_type: "request"
	request_type: "friend"
	/** 为single时对方已将你加为单向好友 */
	sub_type: "add" | "single"
	user_id: number
	nickname: string
	/** @cqhttp cqhttp方法用 */
	flag: string
	comment: string
	source: string
	/** 同意申请需要此参数 */
	seq: number
	age: number
	sex: Gender
	time: number
}

/** 群申请 */
export interface GroupAddReqEvent {
	post_type: "request"
	request_type: "group"
	sub_type: "add"
	user_id: number
	nickname: string
	/** @cqhttp cqhttp方法用 */
	flag: string
	group_id: number
	group_name: string
	comment: string
	/** 同意申请需要此参数 */
	seq: number
	inviter_id?: number
	tips: string
	time: number
}

/** 群邀请 */
export interface GroupInviteReqEvent {
	post_type: "request"
	request_type: "group"
	sub_type: "invite"
	user_id: number
	nickname: string
	/** @cqhttp cqhttp方法用 */
	flag: string
	group_id: number
	group_name: string
	/** 同意申请需要此参数 */
	seq: number
	/** 邀请者在群里的权限 */
	role: GroupRole
	time: number
}

/** 好友增加 */
export interface FriendIncreaseEvent {
	post_type: "notice"
	notice_type: "friend"
	sub_type: "increase"
	user_id: number
	nickname: string
}

/** 好友减少 */
export interface FriendDecreaseEvent {
	post_type: "notice"
	notice_type: "friend"
	sub_type: "decrease"
	user_id: number
	nickname: string
}

/** 好友消息撤回 */
export interface FriendRecallEvent {
	post_type: "notice"
	notice_type: "friend"
	sub_type: "recall"
	user_id: number
	operator_id: number
	/** @cqhttp cqhttp方法用 */
	message_id: string
	seq: number
	rand: number
	time: number
}

/** 好友戳一戳 */
export interface FriendPokeEvent {
	post_type: "notice"
	notice_type: "friend"
	sub_type: "poke"
	user_id: number
	operator_id: number
	target_id: number
	action: string
	suffix: string
}

/** 群员增加 */
export interface MemberIncreaseEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "increase"
	group_id: number
	user_id: number
	nickname: string
}

/** 群员减少 */
export interface MemberDecreaseEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "decrease"
	group_id: number
	operator_id: number
	user_id: number
	dismiss: boolean
	member?: MemberInfo
}

/** 群消息撤回 */
export interface GroupRecallEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "recall"
	group_id: number
	user_id: number
	operator_id: number
	/** @cqhttp cqhttp方法用 */
	message_id: string
	seq: number
	rand: number
	time: number
}

/** 群戳一戳 */
export interface GroupPokeEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "poke"
	group_id: number
	/** @deprecated 群中该值永远等于target_id */
	user_id: number
	operator_id: number
	target_id: number
	action: string
	suffix: string
}

/** 管理员变更 */
export interface GroupAdminEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "admin"
	group_id: number
	user_id: number
	set: boolean
}

/** 群禁言 */
export interface GroupMuteEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "ban"
	group_id: number
	operator_id: number
	user_id: number
	nickname?: string
	duration: number
}

/** 群转让 */
export interface GroupTransferEvent {
	post_type: "notice"
	notice_type: "group"
	sub_type: "transfer"
	group_id: number
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
	"system.login.error": (this: T, event: { code: number, message: string}) => void
	/** 上线事件 */
	"system.online": (this: T, event: undefined) => void

	/**下线事件（网络原因，默认自动重连） */
	"system.offline.network": (this: T, event: { message: string }) => void
	/**下线事件（服务器踢） */
	"system.offline.kickoff": (this: T, event: { message: string }) => void
	"system.offline": (this: T, event: { message: string }) => void

	//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

	/** 好友申请 */
	"request.friend.add": (this: T, event: FriendAddReqEvent) => void
	/** 对方已将你加为单向好友，可回添对方 */
	"request.friend.single": (this: T, event: FriendAddReqEvent) => void

	"request.friend": (this: T, event: FriendAddReqEvent) => void

	/** 加群申请 */
	"request.group.add": (this: T, event: GroupAddReqEvent) => void
	/** 群邀请 */
	"request.group.invite": (this: T, event: GroupInviteReqEvent) => void

	"request.group": (this: T, event: GroupAddReqEvent | GroupInviteReqEvent) => void

	/** 所有request */
	"request": (this: T, event: FriendAddReqEvent | GroupAddReqEvent | GroupInviteReqEvent) => void

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
}
