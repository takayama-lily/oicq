import { randomBytes } from "crypto"
import { pb } from "../core"
import { lock, log } from "../common"
import { parse, MessageElem, Sendable, Converter } from "../message"

type Client = import("../client").Client

export class GuildMessageEvent {
	/** 频道id */
	guild_id: string
	guild_name: string
	/** 子频道id */
	channel_id: string
	channel_name: string
	/** 消息序号(同一子频道中一般顺序递增) */
	seq: number
	rand: number
	time: number
	message: MessageElem[]
	raw_message: string
	sender: {
		tiny_id: string
		nickname: string
	}

	constructor(proto: pb.Proto) {
		const head1 = proto[1][1][1]
		const head2 = proto[1][1][2]
		if (head2[1] !== 3840)
			throw new Error("unsupport guild message type")
		const body = proto[1][3]
		const extra = proto[1][4]
		this.guild_id = String(head1[1])
		this.channel_id = String(head1[2])
		this.guild_name = String(extra[2])
		this.channel_name = String(extra[3])
		this.sender = {
			tiny_id: String(head1[4]),
			nickname: String(extra[1])
		}
		this.seq = head2[4]
		this.rand = head2[3]
		this.time = head2[6]
		const parsed = parse(body[1])
		this.message = parsed.message
		this.raw_message = parsed.brief
		lock(this, "proto")
	}

	/** 暂时仅支持发送： 文本、AT、表情 */
	reply!: (content: Sendable) => void
}

export function guildMsgListener(this: Client, payload: Buffer) {
	try {
		var msg = new GuildMessageEvent(pb.decode(payload))
	} catch {
		return
	}
	if (msg.sender.tiny_id === this.tiny_id && this.config.ignore_self)
		return
	this.logger.info(`recv from: [Guild: ${msg.guild_name}, Member: ${msg.sender.nickname}]` + msg.raw_message)
	msg.reply = (content: Sendable) => {
		const converter = new Converter(content)
		this.writeUni("MsgProxy.SendMsg", pb.encode({
			1: {
				1: {
					1: {
						1: BigInt(msg.guild_id),
						2: Number(msg.channel_id),
						3: this.uin
					},
					2: {
						1: 3840,
						3: randomBytes(4).readUInt32BE()
					}
				},
				3: {
					1: converter.rich
				}
			}
		}))
	}
	this.em("guild.message", msg)
}

// export function guildListPushListener(this: Client, payload: Buffer) {
// 	const rsp = pb.decode(payload)
// 	if (!rsp[3]) return
// 	if (!Array.isArray(rsp[3])) rsp[3] = [rsp[3]]
// 	const tmp = new Set<string>()
// 	for (let proto of rsp[3]) {
// 		const id = String(proto[1])
// 		tmp.add(id)
// 		if (this.guildmap.has(id)) {
// 			this.guildmap.get(id)!.name = String(proto[4])
// 		} else {
// 			this.guildmap.set(id, new Guild(this, proto))
// 		}
// 	}
// 	for (let [id, _] of this.guildmap) {
// 		if (!tmp.has(id))
// 			this.guildmap.delete(id)
// 	}
// 	this.emit("internal.loadguilds")
// }
