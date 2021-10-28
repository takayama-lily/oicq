import { ApiRejection } from "./core"

/** 不包括服务器返回的其他具体错误 */
export enum ErrorCode {

	ClientNotOnline = -1,
	/** 发包超时未收到服务器回应 */
	PacketTimeout = -2,

	UserNotExists = -10,
	GroupNotJoined = -20,
	MemberNotExists = -30,

	/** 传入的消息参数不正确 */
	MessageBuilderError = -60,
	/** 群消息被风控 */
	RiskMessageError = -70,
	/** 群消息有敏感词发送失败 */
	SensitiveWordsError = -80,

	HighwayTimeout = -110,
	HighwayNetworkError = -120,
	NoUploadChannel = -130,

	OfflineFileNotExists = -160,

	FFmpegVideoThumbError = -210,
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
}

export function drop(code: number, message?: string): never {
	if (!message || !message.length)
		message = ErrorMessage[code]
	throw new ApiRejection(code, message)
}

/** 不在内的都属于未知错误，暂时无法解决 */
export enum LoginErrorCode {
	ScanWrongUin = 0,
	ScanTimeout = 17,
	ScanCancelled = 54,
	WrongPassword = 1,
	AccountFrozen = 40,
	TooManySms = 162,
	WrongSmsCode = 163,
	WrongTicket = 237,
}
