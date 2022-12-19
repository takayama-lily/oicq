import { unzipSync } from "zlib"
import { pb } from "../core"
import * as T from "./elements"
import { facemap, pokemap } from "./face"
import { buildImageFileParam } from "./image"

/** 解析消息 */
export function parse(rich: pb.Proto | pb.Proto[], uin?: number) {
	return new Parser(rich, uin)
}

/** 消息解析器 */
export class Parser {

	message: T.MessageElem[] = []
	brief = ""
	content = ""
	/** 匿名情报 */
	anon?: pb.Proto
	/** 额外情报 */
	extra?: pb.Proto
	/** 引用回复 */
	quotation?: pb.Proto
	atme = false
	atall = false

	private exclusive = false
	private it?: IterableIterator<[number, pb.Proto]>

	public constructor(rich: pb.Proto | pb.Proto[], private uin?: number) {
		if (Array.isArray(rich)) {
			this.parseElems(rich)
		} else {
			if (rich[4])
				this.parseExclusiveElem(0, rich[4])
			this.parseElems(Array.isArray(rich[2]) ? rich[2] : [rich[2]])
		}
	}

	/** 获取下一个节点的文本 */
	private getNextText() {
		try {
			const elem = this.it?.next().value[1][1]
			return String(elem[1])
		} catch {
			return "[未知]"
		}
	}

	/** 解析: xml, json, ptt, video, flash, file, shake, poke */
	private parseExclusiveElem(type: number, proto: pb.Proto) {
		let elem: T.MessageElem
		let brief: string
		switch (type) {
		case 12: //xml
		case 51: //json
			const buf = proto[1].toBuffer() as Buffer
			elem = {
				type: type === 12 ? "xml" : "json",
				data: String(buf[0] > 0 ? unzipSync(buf.slice(1)) : buf.slice(1)),
				id: proto[2]
			} as T.XmlElem
			brief = elem.type + "消息"
			this.content = elem.data
			break
		case 3: //flash
			elem = this.parseImgElem(proto, "flash") as T.FlashElem
			brief = "闪照"
			this.content = `{flash:${(elem.file as string).slice(0, 32).toUpperCase()}}`
			break
		case 0: //ptt
			elem = {
				type: "record",
				file: "protobuf://" + proto.toBase64(),
				url: "",
				md5: proto[4].toHex(),
				size: proto[6] || 0,
				seconds: proto[19] || 0,
			}
			if (proto[20]) {
				const url = String(proto[20])
				elem.url = url.startsWith("http") ? url : "https://grouptalk.c2c.qq.com" + url
			}
			brief = "语音"
			this.content = `{ptt:${elem.url}}`
			break
		case 19: //video
			elem = {
				type: "video",
				file: "protobuf://" + proto.toBase64(),
				name: proto[3]?.toString() || "",
				fid: String(proto[1]),
				md5: proto[2].toBase64(),
				size: proto[6] || 0,
				seconds: proto[5] || 0,
			}
			brief = "视频"
			this.content = `{video:${elem.fid}}`
			break
		case 5: //transElem
			const trans = pb.decode(proto[2].toBuffer().slice(3))[7][2]
			elem = {
				type: "file",
				name: String(trans[4]),
				fid: String(trans[2]).replace("/", ""),
				md5: String(trans[8]),
				size: trans[3],
				duration: trans[5],
			}
			brief = "群文件"
			this.content = `{file:${elem.fid}}`
			break
		case 126: //poke
			if (!proto[3])
				return
			const pokeid = proto[3] === 126 ? proto[2][4] : proto[3]
			elem = {
				type: "poke",
				id: pokeid,
				text: pokemap[pokeid]
			}
			brief = pokemap[pokeid]
			this.content = `{poke:${elem.id}}`
			break
		default:
			return
		}
		this.message = [elem]
		this.brief = "[" + brief + "]"
		this.exclusive = true
	}

	/** 解析: text, at, face, bface, sface, image, mirai */
	private parsePartialElem(type: number, proto: pb.Proto) {
		let elem: T.MessageElem
		let brief = ""
		let content = ""
		switch (type) {
		case 1: //text&at
			brief = String(proto[1])
			const buf = proto[3]?.toBuffer() as Buffer
			if (buf && buf[1] === 1) {
				elem = {
					type: "at",
					qq: 0,
					text: brief
				}
				if (buf[6] === 1) {
					elem.qq = "all"
					this.atall = true
				} else {
					elem.qq = buf.readUInt32BE(7)
					if (elem.qq === this.uin)
						this.atme = true
				}
				brief = brief || ("@" + elem.qq)
				content = `{at:${elem.qq}}`
			} else if (proto[12] && !proto[12][1]) {
				// 频道中的AT
				elem = {
					type: "at",
					qq: 0,
					text: brief
				}
				elem.id = proto[12][5] ? String(proto[12][5]) : "all"
				brief = brief || ("@" + elem.qq)
				content = `{at:${elem.qq}}`
			} else {
				if (!brief)
					return
				content = brief
				elem = {
					type: "text",
					text: brief
				}
			}
			break
		case 2: //face
			elem = {
				type: "face",
				id: proto[1],
				text: facemap[proto[1]] || "表情",
			}
			brief = `[${elem.text}]`
			content = `{face:${elem.id}}`
			break
		case 33: //face(id>255)
			elem = {
				type: "face",
				id: proto[1],
				text: facemap[proto[1]],
			}
			if (!elem.text)
				elem.text = proto[2] ? String(proto[2]) : ("/" + elem.id)
			brief = `[${elem.text}]`
			content = `{face:${elem.id}}`
			break
		case 6: //bface
			brief = this.getNextText()
			if (brief.includes("骰子") || brief.includes("猜拳")) {
				elem = {
					type: brief.includes("骰子") ? "dice" : "rps",
					id: proto[12].toBuffer()[16] - 0x30 + 1
				}
				content = `{${elem.type}:${elem.id}}`
			} else {
				elem = {
					type: "bface",
					file: proto[4].toHex() + proto[7].toHex() + proto[5],
					text: brief.replace(/[[\]]/g, "")
				}
				content = `{bface:${elem.text}}`
			}
			break
		case 4:
		case 8:
			elem = this.parseImgElem(proto, "image") as T.ImageElem
			brief = elem.asface ? "[动画表情]" : "[图片]"
			content = `{image:${(elem.file as string).slice(0, 32).toUpperCase()}}`
			break
		case 34: //sface
			brief = this.getNextText()
			elem = {
				type: "sface",
				id: proto[1],
				text: brief.replace(/[[\]]/g, ""),
			}
			content = `{sface:${elem.id}}`
			break
		case 31: //mirai
			if (proto[3] === 103904510) {
				brief = content = String(proto[2])
				elem = {
					type: "mirai",
					data: brief,
				}
			} else {
				return
			}
			break
		default:
			return
		}

		// 删除回复中多余的AT元素
		if (this.message.length === 2 && elem.type === "at" && this.message[0]?.type === "at" && this.message[1]?.type === "text") {
			if (this.message[0].qq === elem.qq && this.message[1].text === " ") {
				this.message.splice(0, 2)
				this.brief = ""
			}
		}

		this.brief += brief
		this.content += content
		if (!Array.isArray(this.message))
			this.message = []
		const prev = this.message[this.message.length - 1]
		if (elem.type === "text" && prev?.type === "text")
			prev.text += elem.text
		else
			this.message.push(elem)
	}

	private parseElems(arr: pb.Proto[]) {
		this.it = arr.entries()
		while (true) {
			let wrapper = this.it.next().value?.[1]
			if (!wrapper) break
			const type = Number(Object.keys(Reflect.getPrototypeOf(wrapper) as object)[0])
			const proto = wrapper[type]
			if (type === 16) { //extraInfo
				this.extra = proto
			} else if (type === 21) { //anonGroupMsg
				this.anon = proto
			} else if (type === 45) { //sourceMsg
				this.quotation = proto
			} else if (!this.exclusive) {
				switch (type) {
				case 1: //text
				case 2: //face
				case 4: //notOnlineImage
				case 6: //bface
				case 8: //customFace
				case 31: //mirai
				case 34: //sface
					this.parsePartialElem(type, proto)
					break
				case 5: //transElem
				case 12: //xml
				case 19: //video
				case 51: //json
					this.parseExclusiveElem(type, proto)
					break
				case 53: //commonElem
					if (proto[1] === 3) { //flash
						this.parseExclusiveElem(3, proto[2][1] ? proto[2][1] : proto[2][2])
					} else if (proto[1] === 33) { //face(id>255)
						this.parsePartialElem(33, proto[2])
					} else if (proto[1] === 2) { //poke
						this.parseExclusiveElem(126, proto)
					}
					break
				default:
					break
				}
			}
		}
	}

	private parseImgElem(proto: pb.Proto, type: "flash" | "image") {
		let elem: T.ImageElem | T.FlashElem
		if (proto[7]?.toHex) {
			elem = {
				type,
				file: buildImageFileParam(proto[7].toHex(), proto[2], proto[9], proto[8], proto[5]),
				url: "",
			}
			if (proto[29] && proto[29][30])
				elem.url = `https://c2cpicdw.qpic.cn${proto[29][30]}&spec=0&rf=naio`
			else if (proto[15])
				elem.url = `https://c2cpicdw.qpic.cn${proto[15]}`
			else if (proto[10])
				elem.url = `https://c2cpicdw.qpic.cn/offpic_new/0/${proto[10]}/0`
			if (elem.type === "image")
				elem.asface = proto[29]?.[1] === 1
		} else { //群图
			elem = {
				type,
				file: buildImageFileParam(proto[13].toHex(), proto[25], proto[22], proto[23], proto[20]),
				url: proto[16] ? `https://gchat.qpic.cn${proto[16]}` : getGroupImageUrl(proto[13].toHex()),
			}
			if (elem.type === "image")
				elem.asface = proto[34]?.[1] === 1
		}
		return elem
	}
}

export function getGroupImageUrl(md5: string) {
	return `https://gchat.qpic.cn/gchatpic_new/0/0-0-${md5.toUpperCase()}/0`
}
