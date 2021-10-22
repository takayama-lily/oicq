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
	dummy?: boolean
}

/** 表情 */
export interface FaceElem {
	type: "face" | "sface"
	id: number
	text?: string
}

/** 原创表情 */
export interface BfaceElem {
	type: "bface"
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
	file: string | Buffer | import("stream").Readable
	cache?: boolean
	timeout?: number
	headers?: import("http").OutgoingHttpHeaders,
	url?: string
	asface?: boolean
	origin?: boolean
}

/** 闪照 */
export interface FlashElem extends Omit<ImageElem, "type"> {
	type: "flash"
}

/** 语音 */
export interface PttElem {
	type: "record"
	file: string | Buffer
	cache?: boolean
	timeout?: number
	headers?: import("http").OutgoingHttpHeaders,
	url?: string
	md5?: string
	size?: number
	seconds?: number
}

/** 视频 */
export interface VideoElem {
	type: "video"
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
	id: number
	text?: string
}

/** 特殊 */
export interface MiraiElem {
	type: "mirai"
	data: string
}

/** 文件 */
export interface FileElem {
	type: "file"
	name: string
	fid: string
	md5: string
	size: number
	duration: number
}

/** todo */
export interface Quotable {
	user_id: number
	time: number
	seq: number
	message?: Sendable
	raw_message?: string
}

export interface Forwardable {
	user_id: number,
	message: Sendable,
	nickname?: string,
	time?: number,
}

export type MessageElem = TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem | AtElem | MiraiElem |
	FlashElem | PttElem | VideoElem | JsonElem | XmlElem | PokeElem | LocationElem | ShareElem | FileElem

export type Sendable = string | MessageElem | (string | MessageElem)[]
