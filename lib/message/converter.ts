import { deflateSync } from "zlib"
import { FACE_OLD_BUF, facemap } from "./face"
import { Image } from "./image"
import { AtElem, BfaceElem, Quotable, MessageElem, TextElem,
	FaceElem, FlashElem, ImageElem, JsonElem, LocationElem, MfaceElem, ReplyElem,
	MiraiElem, PokeElem, PttElem, Sendable, ShareElem, VideoElem, XmlElem, FileElem } from "./elements"
import { pb } from "../core"
import { escapeXml } from "../common"
import { Anonymous, rand2uuid, parseDmMessageId, parseGroupMessageId } from "./message"

const EMOJI_NOT_ENDING = ["\uD835", "\uD83C", "\uD83D", "\uD83E", "\u200D"]
const EMOJI_NOT_STARTING = ["\uFE0F", "\u200D", "\u20E3"]

const PB_RESERVER = pb.encode({
	37: {
		17: 0,
		19: {
			15: 0,
			31: 0,
			41: 0
		},
	}
})

const AT_BUF = Buffer.from([0, 1, 0, 0, 0])
const BUF1 = Buffer.from([1])
const BUF2 = Buffer.alloc(2)

const random = (a: number, b: number) => Math.floor(Math.random() * (b - a) + a)

export interface ConverterExt {
	/** 是否是私聊(default:false) */
	dm?: boolean,
	/** 网络图片缓存路径 */
	cachedir?: string,
	/** 群员列表(用于AT时查询card) */
	mlist?: Map<number, {
		card?: string
		nickname?: string
	}>
}

/** 将消息元素转换为protobuf */
export class Converter {

	is_chain = true
	elems: pb.Encodable[] = []
	/** 用于最终发送 */
	rich: pb.Encodable = { 2: this.elems, 4: null }
	/** 长度(字符) */
	length = 0
	/** 包含的图片(可能需要上传) */
	imgs: Image[] = []
	/** 预览文字 */
	brief = ""
	/** 分片后 */
	private fragments: Uint8Array[] = []

	public constructor(content: Sendable, private ext?: ConverterExt) {
		if (typeof content === "string") {
			this._text(content)
		} else if (Array.isArray(content)) {
			for (let elem of content)
				this._convert(elem)
		} else {
			this._convert(content)
		}
		if (!this.elems.length && !this.rich[4])
			throw new Error("empty message")
		this.elems.push(PB_RESERVER)
	}

	private _convert(elem: MessageElem | string) {
		if (typeof elem === "string")
			this._text(elem)
		else if (Reflect.has(this, elem.type))
			this[elem.type](elem as any)
	}

	private _text(text: string, attr6?: Buffer) {
		text = String(text)
		if (!text.length)
			return
		this.elems.push({
			1: {
				1: text,
				3: attr6
			}
		})
		this.length += text.length
		this.brief += text
	}

	private text(elem: TextElem) {
		this._text(elem.text)
	}

	private at(elem: AtElem) {
		let { qq, id, text, dummy } = elem
		if (qq === 0 && id) {
			// 频道中的AT
			this.elems.push({
				1: {
					1: text || (id === "all" ? "@全体成员" : ("@"+id)),
					12: {
						3: 2,
						5: id === "all" ? 0 : BigInt(id)
					}
				}
			})
			return
		}
		if (qq === "all") {
			var q = 0, flag = 1, display = "全体成员"
		} else {
			var q = Number(qq), flag = 0, display = text || String(qq)
			if (!text) {
				const member = this.ext?.mlist?.get(q)
				display = member?.card || member?.nickname || display
			}
		}
		display = "@" + display
		if (dummy)
			return this._text(display)
		const buf = Buffer.allocUnsafe(6)
		buf.writeUInt8(display.length)
		buf.writeUInt8(flag, 1)
		buf.writeUInt32BE(q, 2)
		const attr6 = Buffer.concat([AT_BUF, buf, BUF2])
		this._text(display, attr6)
	}

	private face(elem: FaceElem) {
		let { id, text } = elem
		id = Number(id)
		if (id < 0 || id > 0xffff || isNaN(id))
			throw new Error("wrong face id: " + id)
		if (id <= 0xff) {
			const old = Buffer.allocUnsafe(2)
			old.writeUInt16BE(0x1441 + id)
			this.elems.push({
				2: {
					1: id,
					2: old,
					11: FACE_OLD_BUF
				}
			})
		} else {
			if (facemap[id])
				text = facemap[id]
			else if (!text)
				text = "/" + id
			this.elems.push({
				53: {
					1: 33,
					2: {
						1: id,
						2: text,
						3: text
					},
					3: 1
				}
			})
		}
		this.brief += "[表情]"
	}

	private sface(elem: FaceElem) {
		let { id, text } = elem
		if (!text)
			text = String(id)
		text = "[" + text + "]"
		this.elems.push({
			34: {
				1: Number(id),
				2: 1,
			}
		})
		this._text(text)
	}

	private bface(elem: BfaceElem, magic?: Buffer) {
		let { file, text } = elem
		if (!text) text = "原创表情"
		text = "[" + String(text).slice(0, 5) + "]"
		const o = {
			1: text,
			2: 6,
			3: 1,
			4: Buffer.from(file.slice(0, 32), "hex"),
			5: parseInt(file.slice(64)),
			6: 3,
			7: Buffer.from(file.slice(32, 64), "hex"),
			9: 0,
			10: 200,
			11: 200,
			12: magic || null
		}
		this.elems.push({ 6: o })
		this._text(text)
	}

	private dice(elem: MfaceElem) {
		const id = (elem.id! >= 1 && elem.id! <= 6) ? (elem.id! - 1) : random(0, 6)
		return this.bface({
			type: "bface", file: "4823d3adb15df08014ce5d6796b76ee13430396532613639623136393138663911464", text: "骰子"
		}, Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]))
	}

	private rps(elem: MfaceElem) {
		const id = (elem.id! >= 1 && elem.id! <= 3) ? (elem.id! - 1) : random(0, 3)
		return this.bface({
			type: "bface", file: "83c8a293ae65ca140f348120a77448ee3764653339666562636634356536646211415", text: "猜拳"
		}, Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id]))
	}

	private image(elem: ImageElem) {
		const img = new Image(elem, this.ext?.dm, this.ext?.cachedir)
		this.imgs.push(img)
		this.elems.push(
			this.ext?.dm ? { 4: img.proto } : { 8: img.proto }
		)
		this.brief += "[图片]"
	}

	private flash(elem: FlashElem) {
		const img = new Image(elem, this.ext?.dm, this.ext?.cachedir)
		this.imgs.push(img)
		this.elems.push({
			53: {
				1: 3,
				2: this.ext?.dm ? { 2: img.proto } : { 1: img.proto },
				3: 0,
			}
		})
		this.elems.push({
			1: {
				1: "[闪照]请使用新版手机QQ查看闪照。"
			}
		})
		this.brief += "[闪照]"
	}

	private record(elem: PttElem) {
		let file = String(elem.file)
		if (!file.startsWith("protobuf://"))
			throw new Error("非法的语音元素: " + file)
		const buf = Buffer.from(file.replace("protobuf://", ""), "base64")
		this.rich[4] = buf
		this.brief += "[语音]"
		this.is_chain = false
	}

	private video(elem: VideoElem) {
		let file = String(elem.file)
		if (!file.startsWith("protobuf://"))
			throw new Error("非法的视频元素: " + file)
		const buf = Buffer.from(file.replace("protobuf://", ""), "base64")
		this.elems.push({ 19: buf })
		this.elems.push({ 1: {
			1: "你的QQ暂不支持查看视频短片，请期待后续版本。"
		} })
		this.brief += "[视频]"
		this.is_chain = false
	}

	private location(elem: LocationElem) {
		let { address, lat, lng, name, id } = elem
		if (!address || !lat || !lng)
			throw new Error("location share need 'address', 'lat' and 'lng'")
		let data = {
			config: { forward: true, type: "card", autosize: true },
			prompt: "[应用]地图",
			from: 1,
			app: "com.tencent.map",
			ver: "1.0.3.5",
			view: "LocationShare",
			meta: {
				"Location.Search": {
					from: "plusPanel",
					id: id || "",
					lat, lng, address,
					name: name || "位置分享"
				}
			},
			desc: "地图"
		}
		this.json({
			type: "json", data
		})
	}

	private share(elem: ShareElem) {
		let { url, title, content, image } = elem
		if (!url || !title)
			throw new Error("link share need 'url' and 'title'")
		if (title.length > 26)
			title = title.substr(0, 25) + "…"
		title = escapeXml(title)
		const data = `<?xml version="1.0" encoding="utf-8"?>
		<msg templateID="12345" action="web" brief="[分享] ${title}" serviceID="1" sourceName="QQ浏览器" url="${escapeXml(url)}"><item layout="2">${image ? `<picture cover="${escapeXml(image)}"/>` : ""}<title>${title}</title><summary>${content ? escapeXml(content) : title}</summary></item><source action="app" name="QQ浏览器" icon="http://url.cn/PWkhNu" i_actionData="tencent100446242://" a_actionData="com.tencent.mtt" appid="100446242" url="http://url.cn/UQoBHn"/></msg>`
		this.xml({
			type: "xml", data, id: 1
		})
	}

	private json(elem: JsonElem) {
		this.elems.push({
			51: {
				1: Buffer.concat([BUF1, deflateSync(typeof elem.data === "string" ? elem.data : JSON.stringify(elem.data))])
			}
		})
		this.brief += "[json消息]"
		this.is_chain = false
	}

	private xml(elem: XmlElem) {
		this.elems.push({
			12: {
				1: Buffer.concat([BUF1, deflateSync(elem.data)]),
				2: elem.id as number > 0 ? elem.id : 60,
			}
		})
		this.brief += "[xml消息]"
		this.is_chain = false
	}

	private poke(elem: PokeElem) {
		let { id } = elem
		if (!(id >= 0 && id <= 6))
			throw new Error("wrong poke id: " + id)
		this.elems.push({
			53: {
				1: 2,
				2: {
					3: 0,
					7: 0,
					10: 0,
				},
				3: id,
			}
		})
		this.brief += "[戳一戳]"
		this.is_chain = false
	}

	private mirai(elem: MiraiElem) {
		const { data } = elem
		this.elems.push({
			31: {
				2: String(data),
				3: 103904510
			}
		})
		this.brief += data
	}

	private file(elem: FileElem) {
		throw new Error("暂不支持发送或转发file元素，请调用文件相关API完成该操作")
	}

	private reply(elem: ReplyElem) {
		const { id } = elem
		if (id.length > 24)
			this.quote({ ...parseGroupMessageId(id), message: "[消息]" })
		else
			this.quote({ ...parseDmMessageId(id), message: "[消息]" })
	}

	/** 转换为分片消息 */
	toFragments() {
		this.elems.pop()
		let frag: pb.Encodable[] = []
		for (let proto of this.elems) {
			if (proto[1] && !proto[1][3]) {
				this._pushFragment(frag)
				frag = []
				this._divideText(proto[1][1])
			} else {
				frag.push(proto)
			}
		}
		if (!frag.length && this.fragments.length === 1) {
			frag.push({
				1: {
					1: "",
				}
			})
		}
		this._pushFragment(frag)
		return this.fragments
	}
	private _divideText(text: string) {
		let n = 0
		while (n < text.length) {
			let m = n + 80
			let chunk = text.slice(n, m)
			n = m
			if (text.length > n) {
				// emoji不能从中间分割，否则客户端会乱码
				while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
					chunk += text[n]
					++n
				}
				while (EMOJI_NOT_STARTING.includes(text[n])) {
					chunk += text[n]
					++n
					while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
						chunk += text[n]
						++n
					}
				}
			}
			this._pushFragment([{
				1: {
					1: chunk
				}
			}])
		}
	}
	private _pushFragment(proto: pb.Encodable[]) {
		if (proto.length > 0) {
			proto.push(PB_RESERVER)
			this.fragments.push(pb.encode({
				2: proto
			}))
		}
	}

	/** 匿名化 */
	anonymize(anon: Omit<Anonymous, "flag">) {
		this.elems.unshift({
			21: {
				1: 2,
				3: anon.name,
				4: anon.id2,
				5: anon.expire_time,
				6: anon.id,
			}
		})
	}

	/** 引用回复 */
	quote(source: Quotable) {
		const elems = new Converter(source.message || "", this.ext).elems
		const tmp = this.brief
		if(!this.ext?.dm){
			this.at({ type: "at", qq: source.user_id })
			this.elems.unshift(this.elems.pop()!)
		}
		this.elems.unshift({
			45: {
				1: [source.seq],
				2: source.user_id,
				3: source.time,
				4: 1,
				5: elems,
				6: 0,
				8: {
					3: rand2uuid(source.rand || 0)
				}
			}
		})
		this.brief = `[回复${this.brief.replace(tmp, "")}]` + tmp
	}
}
