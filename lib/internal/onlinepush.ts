import { pb, jce } from "../core"
import { NOOP, timestamp, OnlineStatus, log } from "../common"
import { PrivateMessage, GroupMessage, DiscussMessage, genDmMessageId, genGroupMessageId } from "../message"
import { GroupMessageEvent, DiscussMessageEvent } from "../events"

type Client = import("../client").Client

/** OnlinePush回执 */
function handleOnlinePush(this: Client, svrip: number, seq: number, items: jce.Nested[] = []) {
	const resp = jce.encodeStruct([
		this.uin, items, svrip & 0xffffffff, null, 0
	])
	const body = jce.encodeWrapper({ resp }, "OnlinePush", "SvcRespPushMsg", seq)
	this.writeUni("OnlinePush.RespPush", body)
}

const statuslist = [
	null,
	OnlineStatus.Online,
	null,
	OnlineStatus.Absent,
	OnlineStatus.Invisible,
	OnlineStatus.Busy,
	OnlineStatus.Qme,
	OnlineStatus.DontDisturb,
]

type OnlinePushEvent = {
	sub_type: string
	[k: string]: any
}

const sub0x27: {[k: number]: (this: Client, data: pb.Proto) => OnlinePushEvent | void} = {
	0: function (data) { //add
		this.classes.set(data[3][1], String(data[3][3]))
	},
	1: function (data) { //delete
		this.classes.delete(data[4][1])
	},
	2: function (data) { //rename
		this.classes.set(data[5][1], String(data[5][2]))
	},
	4: function (data) { //move
		const arr = Array.isArray(data[7][1]) ? data[7][1] : [data[7][1]]
		for (let v of arr)
			this.fl.get(v[1])!.class_id = v[3]
	},
	80: function (data) {
		const o = data[12]
		const gid = o[3]
		if (!o[4]) return
			this.gl.get(gid)!.group_name = String(o[2][2])
	},
	5: function (data) {
		const user_id = data[14][1]
		const nickname = this.fl.get(user_id)?.nickname || ""
		this.fl.delete(user_id)
		this.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`)
		return {
			sub_type: "decrease",
			user_id, nickname
		}
	},
	20: function (data) {
		// 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡 27372在线状态
		const uid = data[8][1]
		let o = data[8][2]
		if (Array.isArray(o))
			o = o[0]
		let key, value: any
		if (o[1] === 20002) {
			key = "nickname"
			value = String(o[2])
			this.fl.get(uid)!.nickname = value
		} else if (o[1] === 20009) {
			key = "sex"
			value = ["unknown", "male", "female"][o[2].toBuffer()[0]]
		} else if (o[1] === 20031) {
			key = "age"
			value = new Date().getFullYear() - o[2].toBuffer().readUInt16BE()
		} else if (o[1] === 27372 && uid === this.uin) {
			const status = o[2].toBuffer()[o[2].toBuffer().length - 1]
			this.status = statuslist[status] || 11
			return
		} else {
			return
		}
		if (uid === this.uin)
			this[key as "nickname"] = value
	},
	40: function (data) {
		const o = data[9][1], uid = o[2]
		if (o[1] > 0) return //0好友备注 1群备注
		this.fl.get(uid)!.remark = String(o[3])
	},
}

// 好友事件解析
const push528: {[k: number]: (this: Client, buf: Buffer) => OnlinePushEvent | void} = {
	0x8A: function (buf) {
		let data = pb.decode(buf)[1]
		if (Array.isArray(data))
			data = data[0]
		let user_id = data[1], operator_id = data[1], flag = 0
		if (user_id === this.uin) {
			user_id = data[2]
			flag = 1
		}
		return {
			sub_type: "recall",
			message_id: genDmMessageId(user_id, data[3], data[6], data[5], flag),
			operator_id,
			user_id, //永远指向对方
			seq: data[3],
			rand: data[6],
			time: data[5],
		}
	},
	0x8B: function (buf) {
		return push528[0x8A].call(this, buf)
	},
	0xB3: function (buf) {
		const data = pb.decode(buf)[2]
		const user_id = data[1], nickname = String(data[5])
		this.fl.set(user_id, {
			user_id: user_id,
			nickname,
			sex: "unknown",
			remark: nickname,
			class_id: data[7]
		})
		this.sl.delete(user_id)
		this.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`)
		return {
			sub_type: "increase",
			user_id, nickname
		}
	},
	0xD4: function (buf) {
		const gid = pb.decode(buf)[1]
		this.pickGroup(gid).renew().catch(NOOP)
	},
	0x27: function (buf) {
		let data = pb.decode(buf)[1]
		if (Array.isArray(data))
			data = data[0]
		return sub0x27[data[2]]?.call(this, data)
	},
	0x122: function (buf) {
		const data = pb.decode(buf)
		const e = parsePoke(data)
		if (e.action) {
			e.operator_id = e.operator_id || this.uin
			e.target_id = e.target_id || this.uin
			return Object.assign(e, { sub_type: "poke" })
		}
	},
	0x115: function (buf) {
		const data = pb.decode(buf)
		const user_id = data[1]
		const end = data[3][4] === 2
		this.emit("internal.input", { user_id, end })
	},
}

function parsePoke(data: any) {
	let target_id = 0, operator_id = 0, action = "", suffix = ""
	for (let o of data[7]) {
		const name = String(o[1]), val = String(o[2])
		switch (name) {
		case "action_str":
		case "alt_str1":
			action = action || val
			break
		case "uin_str1":
			operator_id = parseInt(val)
			break
		case "uin_str2":
			target_id = parseInt(val)
			break
		case "suffix_str":
			suffix = val
			break
		}
	}
	return { target_id, operator_id, action, suffix }
}

// 群事件解析
const push732: {[k: number]: (this: Client, gid: number, buf: Buffer) => OnlinePushEvent | void} = {
	0x0C: function (gid, buf) {
		const operator_id = buf.readUInt32BE(6)
		const user_id = buf.readUInt32BE(16)
		let duration = buf.readUInt32BE(20)
		try {
			if (user_id === 0) {
				duration = duration ? 0xffffffff : 0
				this.gl.get(gid)!.shutup_time_whole = duration
			} else if (user_id === this.uin)
				this.gl.get(gid)!.shutup_time_me = duration ? (timestamp() + duration) : 0
			this.gml.get(gid)!.get(user_id)!.shutup_time = duration ? (timestamp() + duration) : 0
		} catch { }
		this.logger.info(`用户${user_id}在群${gid}被禁言${duration}秒`)
		return {
			sub_type: "ban",
			operator_id, user_id, duration
		}
	},
	0x11: function (gid, buf) {
		const data = pb.decode(buf.slice(7))[11]
		const operator_id = data[1]
		const msg = Array.isArray(data[3]) ? data[3][0] : data[3]
		const user_id = msg[6]
		const message_id = genGroupMessageId(gid, user_id, msg[1], msg[3], msg[2], Array.isArray(data[3]) ? data[3].length : 1)
		return {
			sub_type: "recall",
			user_id, operator_id, message_id,
			seq: msg[1],
			rand: msg[3],
			time: msg[2]
		}
	},
	0x14: function (gid, buf) {
		const data = pb.decode(buf.slice(7))[26]
		let e = parsePoke(data)
		if (e.action) {
			e.operator_id = e.operator_id || this.uin
			e.target_id = e.target_id || this.uin
			return Object.assign(e, {
				sub_type: "poke",
				/** @deprecated */
				user_id: e.target_id
			})
		}
	},
	0x0E: function (gid, buf) {
		if (buf[5] !== 1) return
		const duration = buf.readInt32BE(10)
		if (buf[14] !== 0) {
			const nickname = String(buf.slice(15, 15 + buf[14]))
			const operator_id = buf.readUInt32BE(6)
			this.logger.info(`匿名用户${nickname}在群${gid}被禁言${duration}秒`)
			return {
				sub_type: "ban",
				operator_id,
				user_id: 80000000, nickname,
				duration
			}
		}
	},
}

function emitFriendNoticeEvent(c: Client, uid: number, e: OnlinePushEvent | void) {
	if (!e) return
	const name = "notice.friend." + e.sub_type
	c.em(name, Object.assign({
		post_type: "notice",
		notice_type: "friend",
		user_id: uid,
		friend: c.pickFriend(uid)
	}, e))
}

export function emitGroupNoticeEvent(c: Client, gid: number, e: OnlinePushEvent | void) {
	if (!e) return
	const name = "notice.group." + e.sub_type
	c.em(name, Object.assign({
		post_type: "notice",
		notice_type: "group",
		group_id: gid,
		group: c.pickGroup(gid)
	}, e))
}

export function onlinePushListener(this: Client, payload: Buffer, seq: number) {
	const nested = jce.decodeWrapper(payload)
	const list = nested[2], v = list[0]
	const rubbish = jce.encodeNested([
		this.uin, v[1], v[3], v[8], 0, 0, 0, 0, 0, 0, 0
	])
	handleOnlinePush.call(this, nested[3], seq, [rubbish])
	if (!this._sync_cookie)
		return
	if (v[2] === 528) {
		const uid = v[0]
		const nested = jce.decode(v[6])
		const type = nested[0], buf = nested[10]
		emitFriendNoticeEvent(this, uid, push528[type]?.call(this, buf))
	} else if (v[2] === 732) {
		const gid = v[6].readUInt32BE()
		const type = v[6][4]
		emitGroupNoticeEvent(this, gid, push732[type]?.call(this, gid, v[6]))
	}
}

export function onlinePushTransListener(this: Client, payload: Buffer, seq: number) {
	const proto = pb.decode(payload)
	handleOnlinePush.call(this, proto[11], seq)
	if (!this._sync_cookie) return
	const buf = proto[10].toBuffer()
	const gid = buf.readUInt32BE()
	if (proto[3] === 44) {
		if (buf[5] === 0 || buf[5] === 1) {
			const user_id = buf.readUInt32BE(6)
			const set = buf[10] > 0
			this.logger.info(`群${gid}设置管理员${user_id}: ` + set)
			emitGroupNoticeEvent(this, gid, {
				sub_type: "admin",
				user_id, set
			})
			if (user_id === this.uin)
				this.gl.get(gid)!.admin_flag = set
			this.gml.get(gid)!.get(user_id)!.role = set ? "admin" : "member"
		} else if (buf[5] === 0xFF) {
			const operator_id = buf.readUInt32BE(6)
			const user_id = buf.readUInt32BE(10)
			this.logger.info(`群${gid}被转让给` + user_id)
			emitGroupNoticeEvent(this, gid, {
				sub_type: "transfer",
				operator_id, user_id
			})
			this.gl.get(gid)!.owner_id = user_id
			this.gml.get(gid)!.get(user_id)!.role = "owner"
			this.gml.get(gid)!.get(operator_id)!.role = "member"
		}
	} else if (proto[3] === 34) {
		const user_id = buf.readUInt32BE(5)
		let operator_id, dismiss = false
		let member = this.gml.get(gid)?.get(user_id)
		if (buf[9] === 0x82 || buf[9] === 0x2) {
			operator_id = user_id
			this.gml.get(gid)?.delete(user_id)
			this.logger.info(`${user_id}离开了群${gid}`)
		} else {
			operator_id = buf.readUInt32BE(10)
			if (buf[9] === 0x01 || buf[9] === 0x81)
				dismiss = true
			if (user_id === this.uin) {
				this.gl.delete(gid)
				this.gml.delete(gid)
				this.logger.info(`更新了群列表，删除了群：${gid}`)
			} else {
				this.gml.get(gid)?.delete(user_id)
				this.logger.info(`${user_id}离开了群${gid}`)
			}
		}
		emitGroupNoticeEvent(this, gid, {
			sub_type: "decrease",
			user_id, operator_id, dismiss, member
		})
		this.gl.get(gid)!.member_count--
	}
}

export function dmMsgSyncListener(this: Client, payload: Buffer, seq: number) {
	const proto = pb.decode(payload)
	handleOnlinePush.call(this, proto[2], seq)
	const msg = new PrivateMessage(proto[1], this.uin)
	msg.sender.nickname = this.nickname
	this.em("sync.message", msg)
}

const fragmap = new Map<string, GroupMessage[]>()

export function groupMsgListener(this: Client, payload: Buffer) {
	this.stat.recv_msg_cnt++
	if (!this._sync_cookie) return
	let msg = new GroupMessage(pb.decode(payload)[1]) as GroupMessageEvent
	this.emit(`internal.${msg.group_id}.${msg.rand}`, msg.message_id)

	if (msg.user_id === this.uin && this.config.ignore_self)
		return

	//分片专属屎山
	if (msg.pktnum > 1) {
		const k = [this.uin, msg.group_id, msg.user_id, msg.div].join()
		if (!fragmap.has(k))
			fragmap.set(k, [])
		const arr = fragmap.get(k)!
		arr.push(msg)
		setTimeout(()=>fragmap.delete(k), 5000)
		if (arr.length !== msg.pktnum)
			return
		msg = GroupMessage.combine(arr) as GroupMessageEvent
	}

	if (msg.raw_message) {
		msg.group = this.pickGroup(msg.group_id)
		msg.member = msg.group.pickMember(msg.user_id)
		msg.reply = function (content, quote = false) {
			return this.group.sendMsg(content, quote ? this : undefined)
		}
		msg.recall = function () {
			return this.group.recallMsg(this)
		}
		const sender = msg.sender
		if (msg.member.info) {
			const info = msg.member.info
			sender.nickname = info.nickname
			sender.sex = info.sex
			sender.age = info.age
			sender.area = info.area || ""
			info.card = sender.card
			info.title = sender.title
			info.level = sender.level
			info.last_sent_time = timestamp()
		}
		this.logger.info(`recv from: [Group: ${msg.group_name}(${msg.group_id}), Member: ${sender.card || sender.nickname}(${sender.user_id})] ` + msg)
		this.em("message.group." + msg.sub_type, msg)
		msg.group.info!.last_sent_time = timestamp()
	}
}

export function discussMsgListener(this: Client, payload: Buffer, seq: number) {
	this.statistics.recv_msg_cnt++
	const proto = pb.decode(payload)
	handleOnlinePush.call(this, proto[2], seq)
	if (!this._sync_cookie) return
	const msg = new DiscussMessage(proto[1]) as DiscussMessageEvent
	if (msg.user_id === this.uin && this.config.ignore_self)
		return
	if (msg.raw_message) {
		msg.discuss = this.pickDiscuss(msg.discuss_id)
		msg.reply = msg.discuss.sendMsg.bind(msg.discuss)
		this.logger.info(`recv from: [Discuss: ${msg.discuss_name}(${msg.discuss_id}), Member: ${msg.sender.card}(${msg.sender.user_id})] ` + msg)
		this.em("message.discuss", msg)
	}
}
