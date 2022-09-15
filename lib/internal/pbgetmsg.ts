import { randomBytes } from "crypto"
import { pb, jce } from "../core"
import { uin2code, NOOP, timestamp, log } from "../common"
import { PrivateMessage } from "../message"
import { PrivateMessageEvent } from "../events"
import { emitGroupNoticeEvent } from "./onlinepush"

type Client = import("../client").Client

/** @param seed 填一个常数 */
export function buildSyncCookie(seed: number) {
	const time = timestamp()
	return pb.encode({
		1: time,
		2: time,
		3: seed,
		4: 0xffffffff - seed,
		5: randomBytes(4).readUInt32BE(),
		9: randomBytes(4).readUInt32BE(),
		11: randomBytes(4).readUInt32BE(),
		12: seed & 0xff,
		13: time,
		14: 0,
	})
}

export async function pbGetMsg(this: Client) {
	if (!this._sync_cookie)
		this._sync_cookie = buildSyncCookie(this.sig.session.readUInt32BE())
	let body = pb.encode({
		1: 0,
		2: this._sync_cookie,
		3: 0,
		4: 20,
		5: 3,
		6: 1,
		7: 1,
		9: 1,
	})
	const payload = await this.sendUni("MessageSvc.PbGetMsg", body)
	const proto = pb.decode(payload)
	const rubbish = []
	if (proto[3])
		this._sync_cookie = proto[3].toBuffer()
	if (proto[1] > 0 || !proto[5])
		return
	if (!Array.isArray(proto[5]))
		proto[5] = [proto[5]]
	for (let v of proto[5]) {
		if (!v[4]) continue
		if (!Array.isArray(v[4]))
			v[4] = [v[4]]
		for (let msg of v[4]) {
			const item = { ...msg[1] }
			item[3] = 187
			rubbish.push(item)
			handleSyncMsg.call(this, msg).catch(e => {
				this.logger.debug(e)
			})
		}
	}
	if (rubbish.length)
		this.writeUni("MessageSvc.PbDeleteMsg", pb.encode({ 1: rubbish }))
}

const typelist = [33, 38, 85, 141, 166, 167, 208, 529]

async function handleSyncMsg(this: Client, proto: pb.Proto) {
	const head = proto[1], type = head[3]
	const from = head[1], to = head[2]
	if (from === this.uin && from !== to)
		return
	if (!typelist.includes(type))
		return
	if (this._msgExists(from, type, head[5], head[6]))
		return

	//群员入群
	if (type === 33) {
		const gid = uin2code(from)
		const user_id = head[15]
		const nickname = String(head[16])
		const g = this.pickGroup(gid)
		if (user_id === this.uin) {
			await g.renew().catch(NOOP)
			this.config.cache_group_member && g.getMemberMap()
			this.logger.info(`更新了群列表，新增了群：${gid}`)
		} else {
			try {
				g.info!.member_count++
				g.info!.last_join_time = timestamp()
			} catch { }
			this.config.cache_group_member && await g.pickMember(user_id).renew().catch(NOOP)
			this.logger.info(`${user_id}(${nickname}) 加入了群 ${gid}`)
		}
		emitGroupNoticeEvent(this, gid, {
			sub_type: "increase",
			user_id, nickname
		})
	}

	//被管理批准入群，建群
	else if (type === 85 || type === 38) {
		const gid = uin2code(from)
		const user_id = this.uin
		const nickname = this.nickname
		const g = this.pickGroup(gid)
		await g.renew().catch(NOOP)
		this.config.cache_group_member && g.getMemberMap()
		this.logger.info(`更新了群列表，新增了群：${gid}`)
		emitGroupNoticeEvent(this, gid, {
			sub_type: "increase",
			user_id, nickname
		})
	}

	//私聊消息
	else {
		this.stat.recv_msg_cnt++
		const msg = new PrivateMessage(proto, this.uin) as PrivateMessageEvent
		if (msg.raw_message) {
			msg.friend = this.pickFriend(msg.from_id)
			if (msg.sub_type === "friend")
				msg.sender.nickname = msg.friend.info?.nickname || this.sl.get(msg.from_id)?.nickname || ""
			else if (msg.sub_type === "self")
				msg.sender.nickname = this.nickname
			msg.reply = function (content, quote = false) {
				if (this.sender.group_id)
					return this.friend.asMember(this.sender.group_id).sendMsg(content, quote ? this : undefined)
				return this.friend.sendMsg(content, quote ? this : undefined)
			}
			this.logger.info(`recv from: [Private: ${msg.from_id}(${msg.sub_type})] ` + msg)
			this.em("message.private." + msg.sub_type, msg)
		}
	}
}

export function pushReadedListener(this: Client, payload: Buffer) {
	const nested = jce.decodeWrapper(payload.slice(4))
	for (let v of nested[1]) {
		this.em("sync.read.private", {
			user_id: v[0],
			timestamp: v[1],
		})
	}
	for (let v of nested[2]) {
		this.em("sync.read.group", {
			group_id: v[0],
			seq: v[3],
		})
	}
}
