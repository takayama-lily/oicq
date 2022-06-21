import { ApiRejection } from "./core"

/** 调用API时可能出现的错误 */
export enum ErrorCode {

	/** 客户端离线 */
	ClientNotOnline = -1,
	/** 发包超时未收到服务器回应 */
	PacketTimeout = -2,

	/** 用户不存在 */
	UserNotExists = -10,
	/** 群不存在(未加入) */
	GroupNotJoined = -20,
	/** 群员不存在 */
	MemberNotExists = -30,

	/** 发消息时传入的参数不正确 */
	MessageBuilderError = -60,
	/** 群消息被风控发送失败 */
	RiskMessageError = -70,
	/** 群消息有敏感词发送失败 */
	SensitiveWordsError = -80,

	/** 上传图片/文件/视频等数据超时 */
	HighwayTimeout = -110,
	/** 上传图片/文件/视频等数据遇到网络错误 */
	HighwayNetworkError = -120,
	/** 没有上传通道 */
	NoUploadChannel = -130,
	/** 不支持的file类型(没有流) */
	HighwayFileTypeError = -140,

	/** 文件安全校验未通过不存在 */
	UnsafeFile = -150,

	/** 离线(私聊)文件不存在 */
	OfflineFileNotExists = -160,

	/** 群文件不存在(无法转发) */
	GroupFileNotExists = -170,

	/** 获取视频中的图片失败 */
	FFmpegVideoThumbError = -210,
	/** 音频转换失败 */
	FFmpegPttTransError = -220,
}

const ErrorMessage: {[code: number]: string} = {
	[ErrorCode.UserNotExists]: "查无此人",
	[ErrorCode.GroupNotJoined]: "未加入的群",
	[ErrorCode.MemberNotExists]: "幽灵群员",
	[ErrorCode.RiskMessageError]: "群消息发送失败，可能被风控",
	[ErrorCode.SensitiveWordsError]: "群消息发送失败，请检查消息内容",
	10: "消息过长",
	34: "消息过长",
	120: "在该群被禁言",
	121: "AT全体剩余次数不足"
}

export function drop(code: number, message?: string): never {
	if (!message || !message.length)
		message = ErrorMessage[code]
	throw new ApiRejection(code, message)
}

/** 登录时可能出现的错误，不在列的都属于未知错误，暂时无法解决 */
export enum LoginErrorCode {
	/** 密码错误 */
	WrongPassword = 1,
	/** 账号被冻结 */
	AccountFrozen = 40,
	/** 发短信太频繁 */
	TooManySms = 162,
	/** 短信验证码错误 */
	WrongSmsCode = 163,
	/** 滑块ticket错误 */
	WrongTicket = 237,
}
