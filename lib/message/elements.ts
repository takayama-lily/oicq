/** TEXT */
export interface TextElem {
	type: "text"
	text: string
}

/** AT */
export interface AtElem {
	type: "at"
	qq: number | "all"
	text?: string
	/** 假at */
	dummy?: boolean
}

/** 表情 */
export interface FaceElem {
	type: "face" | "sface"
	/** face为0~324，sface不明 */
	id: number
	text?: string
}

/** 原创表情 */
export interface BfaceElem {
	type: "bface"
	/** 暂时只能发收到的file */
	file: string
	text: string
}

/** 魔法表情 */
export interface MfaceElem {
	type: "rps" | "dice"
	id?: number
}

/** 图片 */
export interface ImageElem {
	type: "image"
	/** 为string时，支持 "http(s)://" "base:64//" 本地文件和收到的file */
	file: string | Buffer | import("stream").Readable
	/** 网络图片是否使用缓存 */
	cache?: boolean
	/** 下载超时时间 */
	timeout?: number
	headers?: import("http").OutgoingHttpHeaders
	/** 这个参数只有在接收时有用 */
	url?: string
	/** 是否作为表情发送 */
	asface?: boolean
	/** 是否显示下载原图按钮 */
	origin?: boolean
}

/** 闪照 */
export interface FlashElem extends Omit<ImageElem, "type"> {
	type: "flash"
}

/** 语音 */
export interface PttElem {
	type: "record"
	/** 为string时，支持 "http(s)://" "base:64//" 本地文件和收到的file */
	file: string | Buffer
	url?: string
	md5?: string
	size?: number
	seconds?: number
}

/** 视频 */
export interface VideoElem {
	type: "video"
	/** 仅支持本地文件与收到的file */
	file: string
	name?: string
	fid?: string
	md5?: string
	size?: number
	seconds?: number
}

/** 地点分享 */
export interface LocationElem {
	type: "location"
	address: string
	lat: number
	lng: number
	name?: string
	id?: string
}

/** 链接分享 */
export interface ShareElem {
	type: "share"
	url: string
	title: string
	content?: string
	image?: string
}

/** JSON */
export interface JsonElem {
	type: "json"
	data: any
}

/** XML */
export interface XmlElem {
	type: "xml"
	data: string
	id?: number
}

/** 戳一戳 */
export interface PokeElem {
	type: "poke"
	/** 0~6 */
	id: number
	text?: string
}

/** 特殊 (官方客户端无法解析此消息) */
export interface MiraiElem {
	type: "mirai"
	data: string
}

/** 文件 (暂时只支持接收，发送请使用文件专用API) */
export interface FileElem {
	type: "file"
	name: string
	fid: string
	md5: string
	size: number
	duration: number
}

/** @deprecated 旧版引用回复(已弃用)，仅做一定程度的兼容 */
export interface ReplyElem {
	type: "reply"
	id: string
}

/** 可引用回复的消息 */
export interface Quotable {
	user_id: number
	time: number
	seq: number
	rand: number
	message: Sendable
}

/** 可转发的消息 */
export interface Forwardable {
	user_id: number,
	message: Sendable,
	nickname?: string,
	time?: number,
}

/** 可组合发送的元素 */
export type ChainElem = TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem | AtElem | MiraiElem | ReplyElem

/** 注意：只有`ChainElem`中的元素可以组合发送，其他元素只能单独发送 */
export type MessageElem = TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem | AtElem | MiraiElem | ReplyElem |
	FlashElem | PttElem | VideoElem | JsonElem | XmlElem | PokeElem | LocationElem | ShareElem | FileElem

/** 可通过sendMessage发送的类型集合 */
export type Sendable = string | MessageElem | (string | MessageElem)[]
