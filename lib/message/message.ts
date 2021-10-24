import * as qs from "querystring"
import { pb } from "../core"
import { hide, parseFunString, GroupRole, Gender, log } from "../common"
import { Parser, parse} from "./parser"
import { Quotable, Forwardable, MessageElem } from "./elements"

/** 匿名者情报 */
export interface Anonymous {
	flag: string
	id: number
	id2: number
	name: string
	expire_time: number
	color: string
}

export function rand2uuid(random: number) {
	return 16777216n << 32n | BigInt(random)
}
export function uuid2rand(uuid: bigint) {
	return Number(BigInt(uuid) & 0xffffffffn)
}

/** 生成私聊消息id */
export function genDmMessageId(uid: number, seq: number, rand: number, time: number, flag = 0) {
	const buf = Buffer.allocUnsafe(17)
	buf.writeUInt32BE(uid)
	buf.writeInt32BE(seq & 0xffffffff, 4)
	buf.writeInt32BE(rand & 0xffffffff, 8)
	buf.writeUInt32BE(time, 12)
	buf.writeUInt8(flag, 16) //接收为0 发送为1
	return buf.toString("base64")
}

/** 解析私聊消息id */
export function parseDmMessageId(msgid: string) {
	const buf = Buffer.from(msgid, "base64")
	const user_id = buf.readUInt32BE(),
		seq = buf.readUInt32BE(4),
		rand = buf.readUInt32BE(8),
		time = buf.readUInt32BE(12),
		flag = buf.length >= 17 ? buf.readUInt8(16) : 0
	return { user_id, seq, rand, time, flag }
}

/** 生成群消息id */
export function genGroupMessageId(gid: number, uid: number, seq: number, rand: number, time: number, pktnum = 1) {
	const buf = Buffer.allocUnsafe(21)
	buf.writeUInt32BE(gid)
	buf.writeUInt32BE(uid, 4)
	buf.writeInt32BE(seq & 0xffffffff, 8)
	buf.writeInt32BE(rand & 0xffffffff, 12)
	buf.writeUInt32BE(time, 16)
	buf.writeUInt8(pktnum > 1 ? pktnum : 1, 20)
	return buf.toString("base64")
}

/** 解析群消息id */
export function parseGroupMessageId(msgid: string) {
	const buf = Buffer.from(msgid, "base64")
	const group_id = buf.readUInt32BE(),
		user_id = buf.readUInt32BE(4),
		seq = buf.readUInt32BE(8),
		rand = buf.readUInt32BE(12),
		time = buf.readUInt32BE(16),
		pktnum = buf.length >= 21 ? buf.readUInt8(20) : 1
	return { group_id, user_id, seq, rand, time, pktnum }
}

/** 一条消息 */
export abstract class Message implements Quotable, Forwardable {

	protected readonly parsed: Parser

	/**
	 * 该值永远指向消息发送者。
	 * 对于私聊消息，请使用 from_id 和 to_id 来确定发送者和接收者。
	 * @deprecated 未来会改为访问器，仅供内部转发消息时使用。
	 */
	user_id: number

	/** 仅供内部转发消息时使用 */
	get nickname(): string {
		return this.sender?.card || this.sender?.nickname || ""
	}

	time: number
	message: MessageElem[]
	raw_message: string
	font: string
	message_id = ""
	/** 消息编号 */
	seq: number
	/** 消息随机数 */
	rand: number
	sender?: {[k: string]: any}

	pktnum: number
	index: number
	div: number

	/** 反序列化一条消息 */
	static unserialize(serialized: Buffer) {
		const proto = pb.decode(serialized)
		switch (proto[1][3]) {
		case 82:
			return new GroupMessage(proto)
		case 83:
			return new DiscussMessage(proto)
		default:
			return new PrivateMessage(proto)
		}
	}

	constructor(protected proto: pb.Proto) {
		this.proto = proto
		const head = proto[1], frag = proto[2], body = proto[3]
		this.pktnum = frag[1]
		this.index = frag[2]
		this.div = frag[2]
		this.user_id = head[1]
		this.time = head[6]
		this.seq = head[5]
		this.rand = proto[3]?.[1]?.[1]?.[3] || uuid2rand(head[7])
		this.font = body[1]?.[1]?.[9]?.toString() || "unknown"
		this.parsed = parse(body[1], head[2])
		this.message = this.parsed.content
		this.raw_message = this.parsed.brief
		
		hide(this, "proto")
		hide(this, "parsed")
		hide(this, "pkgnum")
		hide(this, "index")
		hide(this, "div")
	}

	/** 将消息序列化保存 */
	serialize() {
		return this.proto.toBuffer()
	}

	/** 以人类可读的形式输出 */
	toString() {
		return this.raw_message
	}

	/** @deprecated 转换为CQ码 */
	toCqcode() {
		return genCqcode(this.message)
	}
}

/** 一条私聊消息 */
export class PrivateMessage extends Message {

	message_type = "private" as "private"
	sub_type = "friend" as "friend" | "group" | "other" | "self"
	from_id: number
	to_id: number
	auto_reply: boolean
	sender = {
		user_id: 0,
		nickname: "",
		group_id: undefined as number | undefined,
		discuss_id: undefined as number | undefined,
	}

	/** 反序列化一条私聊消息，你需要传入你的uin，否则无法知道你是发送者还是接收者 */
	static unserialize(serialized: Buffer, uin?: number) {
		return new PrivateMessage(pb.decode(serialized), uin)
	}

	constructor(proto: pb.Proto, uin?: number) {
		super(proto)
		const head = proto[1], content = proto[2], body = proto[3]
		this.from_id = this.sender.user_id = head[1]
		this.to_id = head[2]
		this.auto_reply = !!(content && content[4])
		switch (head[3]) {
		case 529:
			if (head[4] === 4) {
				const trans = body[2][1]
				this.message = [{
					type: "file",
					name: String(trans[5]),
					size: trans[6],
					md5: trans[4].toHex(),
					duration: trans[51] || 0,
					fid: String(trans[3]),
				}]
				this.raw_message = "[离线文件]"
			} else {
				this.sub_type = this.from_id === this.to_id ? "self" : "other"
				this.message = this.raw_message = body[2]?.[6]?.[5]?.[1]?.[2]?.toString() || ""
			}
			break
		case 141:
			this.sub_type = "group"
			this.sender.nickname = this.parsed.extra?.[1]?.toString() || ""
			if (head[8]?.[3])
				this.sender.group_id = head[8]?.[4]
			else
				this.sender.discuss_id = head[8]?.[4]
			break
		}
		let opposite = this.from_id, flag = 0
		if (this.from_id === uin)
			opposite = this.to_id, flag = 1
		this.message_id = genDmMessageId(opposite, this.seq, this.rand, this.time, flag)
	}
}

/** 一条群消息 */
export class GroupMessage extends Message {

	message_type = "group" as "group"
	sub_type: "normal" | "anonymous"
	group_id: number
	group_name: string
	anonymous: Anonymous | null
	blocking: boolean
	atme: boolean
	atall: boolean
	sender = {
		user_id: 0,
		nickname: "",
		card: "",
		/** @deprecated */
		sex: "unknown" as Gender,
		/** @deprecated */
		age: 0,
		/** @deprecated */
		area: "",
		level: 0,
		role: "member" as GroupRole,
		title: ""
	}

	/** 反序列化一条群消息 */
	static unserialize(serialized: Buffer) {
		return new GroupMessage(pb.decode(serialized))
	}

	/** 组合分片消息 */
	static combine(msgs: GroupMessage[]) {
		const host = msgs[0]
		let chain = host.message
		for (const msg of msgs.slice(1)) {
			if (msg.atme) host.atme = true
			if (msg.atall) host.atall = true
			for (const elem of msg.message) {
				const prev = chain[chain.length-1]
				if (elem.type === "text" && prev?.type === "text")
					prev.text += elem.text
				else
					chain.push(elem)
			}
			host.raw_message += msg.raw_message
		}
		return host
	}

	constructor(proto: pb.Proto) {
		super(proto)
		const group = proto[1][9]
		this.group_id = group[1] || 0
		this.group_name = group[8]?.toString() || ""
		this.blocking = group[2] === 127
		this.sender.user_id = proto[1][1]
		if (this.parsed.anon) {
			this.sub_type = "anonymous"
			this.anonymous = {
				id: this.parsed.anon[6],
				id2: this.parsed.anon[4],
				name: String(this.parsed.anon[3]),
				color: String(this.parsed.anon[7]),
				expire_time: this.parsed.anon[5],
				flag: String(this.parsed.anon[3]) + "@" + this.parsed.anon[2].toBase64(),
			}
			this.sender.card = this.sender.nickname = "匿名消息"
		} else {
			this.sub_type = "normal"
			this.anonymous = null
			const ext = this.parsed.extra
			if (!ext?.[2])
				this.sender.nickname = ext?.[1]?.toString() || ""
			else
				this.sender.nickname = this.sender.card = parseFunString(group[4].toBuffer())
			if (ext?.[4])
				this.sender.role = ext[4] === 8 ? "owner" : "admin"
			this.sender.level = ext?.[3] | 0
			this.sender.title = ext?.[7]?.toString() || ""

		}
		this.atme = this.parsed.atme
		this.atall = this.parsed.atall
		this.message_id = genGroupMessageId(this.group_id, this.user_id, this.seq, this.rand, this.time, this.pktnum)
	}
}

/** 一条讨论组消息 */
export class DiscussMessage extends Message {

	message_type = "discuss" as "discuss"
	discuss_id: number
	discuss_name: string
	atme: boolean
	sender: {
		user_id: number,
		nickname: string,
		card: string,
	}

	/** 反序列化一条讨论组消息 */
	static unserialize(serialized: Buffer) {
		return new DiscussMessage(pb.decode(serialized))
	}

	constructor(proto: pb.Proto) {
		super(proto)
		const discuss = proto[1][13]
		this.discuss_id = discuss[1] || 0
		this.discuss_name = discuss[5]?.toString() || ""
		this.atme = this.parsed.atme
		const card = discuss[4]?.toString() || ""
		this.sender = {
			user_id: proto[1][1],
			nickname: card,
			card: card,
		}
		this.rand = proto[3][1][1][3]
	}
}

/** 一条转发消息 */
export class ForwardMessage implements Forwardable {

	user_id: number
	nickname: string
	time: number
	message: MessageElem[]
	raw_message: string

	/** 反序列化一条转发消息 */
	static unserialize(serialized: Buffer) {
		return new ForwardMessage(pb.decode(serialized))
	}

	constructor(protected proto: pb.Proto) {
		this.proto = proto
		const head = proto[1]
		this.time = head[6] | 0
		this.user_id = head[1] | 0
		this.nickname = head[14]?.toString() || ""
		const p = parse(proto[3][1])
		this.message = p.content
		this.raw_message = p.brief
		hide(this, "proto")
	}

	/** 将转发消息序列化保存 */
	serialize() {
		return this.proto.toBuffer()
	}

	/** 以人类可读的形式输出 */
	toString() {
		return this.raw_message
	}

	/** @deprecated 转换为CQ码 */
	toCqcode() {
		return genCqcode(this.message)
	}
}

function escapeCQInside(s: string) {
	if (s === "&") return "&amp;"
	if (s === ",") return "&#44;"
	if (s === "[") return "&#91;"
	if (s === "]") return "&#93;"
	return ""
}

function genCqcode(content: MessageElem[]) {
	let cqcode = ""
	for (let elem of content) {
		const tmp = { ...elem } as Partial<MessageElem>
		tmp.type = undefined 
		const str = qs.stringify(tmp as NodeJS.Dict<any>, ",", "=", { encodeURIComponent: (s) => s.replace(/&|,|\[|\]/g, escapeCQInside) })
		cqcode += "[CQ:" + elem.type + (str ? "," : "") + str + "]"
	}
	return cqcode
}
