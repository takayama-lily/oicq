import { unzipSync } from "zlib"
import { pb } from "../core"
import * as T from "./elements"
import { facemap, pokemap } from "./face"
import { buildFileParam } from "./image"

export function parse(rich: pb.Proto | pb.Proto[], uin?: number) {
	return new Parser(rich, uin)
}

export class Parser {

	content: T.MessageElem[] = []
	brief = ""
	anon?: pb.Proto
	extra?: pb.Proto
	general?: pb.Proto
	atme = false
	atall = false
	quotation?: T.Quotable

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
			elem = {
				type: type === 12 ? "xml" : "json",
				data: ""
			} as T.XmlElem | T.JsonElem
			const buf = proto[1].toBuffer() as Buffer
			if (buf[0] > 0)
				elem.data = String(unzipSync(buf.slice(1)))
			else
				elem.data = String(buf.slice(1))
			if (proto[2] > 0)
				(elem as T.XmlElem).id = proto[2]
			brief = elem.type + "消息"
			break
		case 3: //flash
			elem = this.parseImgElem(proto, "flash") as T.FlashElem
			brief = "闪照"
			break
		case 0: //ptt
			elem = {
				type: "record",
				file: "protobuf://" + proto.toBase64(),
				url: undefined,
				md5: proto[4].toHex(),
				size: proto[6] || 0,
				seconds: proto[19] || 0,
			}
			if (proto[20]) {
				const url = String(proto[20])
				elem.url = url.startsWith("http") ? url : "https://grouptalk.c2c.qq.com" + url
			}
			brief = "语音"
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
			break
		default:
			return
		}
		this.content.push(elem)
		this.brief = "[" + brief + "]"
		this.exclusive = true
	}

	/** 解析: text, at, face, bface, sface, image, mirai */
	private parsePartialElem(type: number, proto: pb.Proto) {
		let elem: T.MessageElem
		let brief = ""
		switch (type) {
		case 1: //text&at
			brief = String(proto[1])
			const buf = proto[3]?.toBuffer() as Buffer
			if (buf && buf[1] === 1) {
				elem = {
					type: "at",
					qq: 0,
					text: ""
				}
				if (buf[6] === 1) {
					elem.qq = "all"
					this.atall = true
				} else {
					elem.qq = buf.readUInt32BE(7)
					this.atme = elem.qq === this.uin
				}
				brief = brief || ("@" + elem.qq)
			} else {
				if (!brief)
					return
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
			break
		case 6: //bface
			brief = this.getNextText()
			if (brief.includes("骰子") || brief.includes("猜拳")) {
				elem = {
					type: brief.includes("骰子") ? "dice" : "rps",
					id: proto[12].toBuffer()[16] - 0x30 + 1
				}
			} else {
				elem = {
					type: "bface",
					file: proto[4].toHex() + proto[7].toHex() + proto[5],
					text: brief.replace(/[[\]]/g, "")
				}
			}
			break
		case 4:
		case 8:
			elem = this.parseImgElem(proto, "image") as T.ImageElem
			brief = elem.asface ? "[动画表情]" : "[图片]"
			break
		case 34: //sface
			brief = this.getNextText()
			elem = {
				type: "sface",
				id: proto[1],
				text: brief.replace(/[[\]]/g, ""),
			}
			break
		case 31: //mirai
			if (proto[3] === 103904510) {
				brief = String(proto[2])
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
		this.brief += brief
		if (!Array.isArray(this.content))
			this.content = []
		const prev = this.content[this.content.length - 1]
		if (elem.type === "text" && prev?.type === "text")
			prev.text += elem.text
		else
			this.content.push(elem)
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
			} else if (type === 37) { //generalFlags
				this.general = proto
				// if (proto[6] === 1 && proto[7])
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
				case 45: //reply
					this.parseQuotation(proto)
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
				file: buildFileParam(proto[7].toHex(), proto[2], proto[9], proto[8], proto[5]),
				url: "",
			}
			if (proto[15])
				elem.url = `https://c2cpicdw.qpic.cn${proto[15]}`
			else if (proto[10])
				elem.url = `https://c2cpicdw.qpic.cn/offpic_new/0/${proto[10]}/0`
			if (elem.type === "image")
				elem.asface = proto[29]?.[1] === 1
		} else { //群图
			elem = {
				type,
				file: buildFileParam(proto[13].toHex(), proto[25], proto[22], proto[23], proto[20]),
				url: proto[16] ? `https://gchat.qpic.cn${proto[16]}` : `https://gchat.qpic.cn/gchatpic_new/0/0-0-${proto[13].toHex().toUpperCase()}/0`,
			}
			if (elem.type === "image")
				elem.asface = proto[34]?.[1] === 1
		}
		return elem
	}

	private parseQuotation(proto: pb.Proto) {
		if (Array.isArray(proto[1]))
			proto[1] = proto[1][0]
		const source = parse(Array.isArray(proto[5]) ? proto[5] : [proto[5]])
		this.quotation = {
			user_id: proto[2],
			time: proto[3],
			seq: proto[1],
			message: source.content,
			raw_message: source.brief
		}
	}
}
