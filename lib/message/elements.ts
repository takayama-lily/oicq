/** TEXT (此元素可使用字符串代替) */
export interface TextElem {
	type: "text"
	text: string
}

/** AT */
export interface AtElem {
	type: "at"
	/** 在频道消息中该值为0 */
	qq: number | "all"
	/** 频道中的tiny_id */
	id?: string | "all"
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
	/**
	 * @type {string} filepath such as "/tmp/1.jpg"
	 * @type {Buffer} image buffer
	 * @type {Readable} a readable stream of image
	 */
	file: string | Buffer | import("stream").Readable
	/** 网络图片是否使用缓存 */
	cache?: boolean
	/** 流的超时时间，默认60(秒) */
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
	/**
	 * support for raw silk and amr file
	 * @type {string} filepath such as "/tmp/1.slk"
	 * @type {Buffer} ptt buffer (silk or amr)
	 */
	file: string | Buffer
	url?: string
	md5?: string
	size?: number
	seconds?: number
}

/** 视频 */
export interface VideoElem {
	type: "video"
	/**
	 * need ffmpeg and ffprobe
	 * @type {string} filepath such as "/tmp/1.mp4"
	 */
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

/** @deprecated @cqhttp 旧版引用回复(已弃用)，仅做一定程度的兼容 */
export interface ReplyElem {
	type: "reply"
	id: string
}

/** 可引用回复的消息 */
export interface Quotable {
	user_id: number
	time: number
	seq: number
	/** 私聊回复必须 */
	rand: number
	/** 收到的引用回复永远是字符串 */
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

/** 可通过sendMsg发送的类型集合 (字符串、元素对象，或它们的数组) */
export type Sendable = string | MessageElem | (string | MessageElem)[]

/** 用于构造消息元素 */
export const segment = {
	/** @deprecated 文本，建议直接使用字符串 */
	text(text: string): TextElem {
		return {
			type: "text", text
		}
	},
	/** 经典表情(id=0~324) */
	face(id: number): FaceElem {
		return {
			type: "face", id
		}
	},
	/** 小表情(id规则不明) */
	sface(id: number, text?: string): FaceElem {
		return {
			type: "sface", id, text
		}
	},
	/** 原创表情(file规则不明) */
	bface(file: string, text: string): BfaceElem {
		return {
			type: "bface", file, text
		}
	},
	/** 猜拳(id=1~3) */
	rps(id?: number): MfaceElem {
		return {
			type: "rps", id
		}
	},
	/** 骰子(id=1~6) */
	dice(id?: number): MfaceElem {
		return {
			type: "dice", id
		}
	},
	/** mention@提及
	 * @param qq 全体成员:"all", 频道:tiny_id
	 */
	at(qq: number | "all" | string, text?: string, dummy?: boolean): AtElem {
		if (typeof qq === "number" || qq === "all") {
			return {
				type: "at", qq, text, dummy
			}
		}
		// 频道中的AT
		return {
			type: "at", qq: 0, id: String(qq), text, dummy
		}
	},
	/** 图片(支持http://,base64://) */
	image(file: ImageElem["file"], cache?: boolean, timeout?: number, headers?: import("http").OutgoingHttpHeaders): ImageElem {
		return {
			type: "image", file, cache, timeout, headers
		}
	},
	/** 闪照(支持http://,base64://) */
	flash(file: ImageElem["file"], cache?: boolean, timeout?: number, headers?: import("http").OutgoingHttpHeaders): FlashElem {
		return {
			type: "flash", file, cache, timeout, headers
		}
	},
	/** 语音(支持http://,base64://) */
	record(file: string | Buffer): PttElem {
		return {
			type: "record", file
		}
	},
	/** 视频(仅支持本地文件) */
	video(file: string): VideoElem {
		return {
			type: "video", file
		}
	},
	json(data: any): JsonElem {
		return {
			type: "json", data
		}
	},
	xml(data: string, id?: number): XmlElem {
		return {
			type: "xml", data, id
		}
	},
	/** 一种特殊消息(官方客户端无法解析) */
	mirai(data: string): MiraiElem {
		return {
			type: "mirai", data
		}
	},
	/** 链接分享 */
	share(url: string, title: string, image?: string, content?: string): ShareElem {
		return {
			type: "share", url, title, image, content
		}
	},
	/** 位置分享 */
	location(lat: number, lng: number, address: string, id?: string): LocationElem {
		return {
			type: "location", lat, lng, address, id
		}
	},
	/** id 0~6 */
	poke(id: number): PokeElem {
		return {
			type: "poke", id
		}
	},
	/** @deprecated 将CQ码转换为消息链 */
	fromCqcode(str: string) {
		const elems: MessageElem[] = []
		const res = str.matchAll(/\[CQ:[^\]]+\]/g)
		let prev_index = 0
		for (let v of res) {
			const text = str.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
			if (text)
				elems.push({ type: "text", text })
			const element = v[0]
			let cq = element.replace("[CQ:", "type=")
			cq = cq.substr(0, cq.length - 1)
			elems.push(qs(cq))
			prev_index = v.index as number + element.length
		}
		if (prev_index < str.length) {
			const text = str.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
			if (text)
				elems.push({ type: "text", text })
		}
		return elems
	}
}

function unescapeCQ(s: string) {
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}
function unescapeCQInside(s: string) {
	if (s === "&#44;") return ","
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}
function qs(s: string, sep = ",", equal = "=") {
	const ret: any = { }
	const split = s.split(sep)
	for (let v of split) {
		const i = v.indexOf(equal)
		if (i === -1) continue
		ret[v.substring(0, i)] = v.substr(i + 1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside)
	}
	for (let k in ret) {
		try {
			if (k !== "text")
				ret[k] = JSON.parse(ret[k])
		} catch { }
	}
	return ret as MessageElem
}
