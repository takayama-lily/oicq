import { pb, jce } from "../core"
import { NOOP, timestamp, OnlineStatus, log } from "../common"
import { PrivateMessage, GroupMessage, DiscussMessage, genDmMessageId, genGroupMessageId } from "../message"
import { GroupMessageEvent, DiscussMessageEvent } from "../events"

type Client = import("../client").Client

/** OnlinePush回执 */
function handleOnlinePush(this: Client, svrip: number, seq: number, rubbish: jce.Nested[] = []) {
	const resp = jce.encodeStruct([
		this.uin, rubbish, svrip & 0xffffffff, null, 0
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

type OnlinePushEvent = [name: string, event: any]

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
			this.fl.has(v[1]) && (this.fl.get(v[1])!.class_id = v[3])
	},
	80: function (data) {
		const o = data[12]
		const group_id = o[3]
		if (!o[4]) return
		this.gl.has(group_id) && (this.gl.get(group_id)!.group_name = String(o[2][2]))
	},
	5: function (data) {
		const user_id = data[14][1]
		const nickname = this.fl.get(user_id)?.nickname || ""
		this.fl.delete(user_id)
		this.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`)
		return ["notice.friend.decrease", {
			user_id, nickname
		}]
	},
	20: function (data) {
		// 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡 27372在线状态
		const user_id = data[8][1]
		let o = data[8][2]
		if (Array.isArray(o))
			o = o[0]
		let key, value: any
		if (o[1] === 20002) {
			key = "nickname"
			value = String(o[2])
			this.fl.get(user_id)!.nickname = value
		} else if (o[1] === 20009) {
			key = "sex"
			value = ["unknown", "male", "female"][o[2].toBuffer()[0]]
		} else if (o[1] === 20031) {
			key = "age"
			value = new Date().getFullYear() - o[2].toBuffer().readUInt16BE()
		} else if (o[1] === 27372 && user_id === this.uin) {
			const status = o[2].toBuffer()[o[2].toBuffer().length - 1]
			this.status = statuslist[status] || 11
			return
		} else {
			return
		}
		if (user_id === this.uin)
			this[key as "nickname"] = value
	},
	40: function (data) {
		const o = data[9][1], user_id = o[2]
		if (o[1] > 0) return //0好友备注 1群备注
		const remark = String(o[3])
		this.fl.has(user_id) && (this.fl.get(user_id)!.remark = remark)
	},
}

const push528: {[k: number]: (this: Client, buf: Buffer) =>  OnlinePushEvent | void} = {
	0x8A: function (buf) {
		let data = pb.decode(buf)[1]
		if (Array.isArray(data))
			data = data[0]
		let user_id = data[1], operator_id = data[1], flag = 0
		if (user_id === this.uin) {
			user_id = data[2]
			flag = 1
		}
		return ["notice.friend.recall", {
			user_id, operator_id,
			message_id: genDmMessageId(user_id, data[3], data[6], data[5], flag),
			seq: data[3],
			rand: data[6],
			time: data[5],
		}]
	},
	0x8B: function (buf) {
		return push528[0x8A].call(this, buf)
	},
	0xB3: function (buf) {
		const data = pb.decode(buf)[2]
		const user_id = data[1], nickname = String(data[5])
		this.fl.set(user_id, {
			user_id, nickname,
			sex: "unknown",
			remark: nickname,
			class_id: data[7]
		})
		this.sl.delete(user_id)
		this.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`)
		return ["notice.friend.increase", {
			user_id, nickname
		}]
	},
	0xD4: function (buf) {
		const group_id = pb.decode(buf)[1]
		this.pickGroup(group_id).renew().catch(NOOP)
	},
	0x27: function (buf) {
		let data = pb.decode(buf)[1]
		if (Array.isArray(data))
			data = data[0]
		if (typeof sub0x27[data[2]] === "function")
			sub0x27[data[2]].call(this, data)
	},
	0x122: function (buf) {
		const data = pb.decode(buf)
		const eve = parsePoke(data)
		if (eve.action) {
			eve.operator_id = eve.operator_id || this.uin
			eve.target_id = eve.target_id || this.uin
			return ["notice.friend.poke", Object.assign(eve, { user_id: 0 })]
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
	let target_id = 0, operator_id = 0, action, suffix
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

const push732: {[k: number]: (this: Client, group_id: number, buf: Buffer) =>  OnlinePushEvent | void} = {
	0x0C: function (group_id, buf) {
		const operator_id = buf.readUInt32BE(6)
		const user_id = buf.readUInt32BE(16)
		let duration = buf.readUInt32BE(20)
		try {
			if (user_id === 0) {
				duration = duration ? 0xffffffff : 0
				this.gl.get(group_id)!.shutup_time_whole = duration
			} else if (user_id === this.uin)
				this.gl.get(group_id)!.shutup_time_me = duration ? (timestamp() + duration) : 0
			this.gml.get(group_id)!.get(user_id)!.shutup_time = duration ? (timestamp() + duration) : 0
		} catch { }
		return ["notice.group.ban", {
			group_id, operator_id, user_id, duration
		}]
	},
	0x11: function (group_id, buf) {
		const data = pb.decode(buf.slice(7))[11]
		const operator_id = data[1]
		const msg = Array.isArray(data[3]) ? data[3][0] : data[3]
		const user_id = msg[6]
		const message_id = genGroupMessageId(group_id, user_id, msg[1], msg[3], msg[2], Array.isArray(data[3]) ? data[3].length : 1)
		return ["notice.group.recall", {
			group_id, user_id, operator_id, message_id,
			seq: msg[1],
			rand: msg[3],
			time: msg[2]
		}]
	},
	0x14: function (group_id, buf) {
		const data = pb.decode(buf.slice(7))[26]
		let eve = parsePoke(data)
		if (eve.action) {
			eve.operator_id = eve.operator_id || this.uin
			eve.target_id = eve.target_id || this.uin
			return ["notice.group.poke", Object.assign(eve, { group_id, user_id: eve.target_id })]
		}
	},
	0x0E: function (group_id, buf) {
		if (buf[5] !== 1) return
		const duration = buf.readInt32BE(10)
		if (buf[14] !== 0) {
			const nickname = String(buf.slice(15, 15 + buf[14]))
			const operator_id = buf.readUInt32BE(6)
			return ["notice.group.ban", {
				group_id, operator_id,
				user_id: 80000000, nickname,
				duration
			}]
		}
	},
}

function emitNoticeEvent(c: Client, name: string, event: any) {
	const sp = name.split(".")
	event.notice_type = sp[1]
	event.sub_type = sp[2]
	c.em(name, event)
}

export function onlinePushListener(this: Client, payload: Buffer, seq: number) {
	const nested = jce.decodeWrapper(payload)
	const list = nested[2]
	const rubbish: jce.Nested[] = []
	for (let v of list) {
		rubbish.push(jce.encodeNested([
			this.uin, v[1], v[3], v[8], 0, 0, 0, 0, 0, 0, 0
		]))
		if (!this._sync_cookie) continue
		if (v[2] === 528) {
			const nested = jce.decode(v[6])
			const type = nested[0], buf = nested[10]
			if (typeof push528[type] === "function") {
				const e = push528[type].call(this, buf)
				if (e && e[0] === "notice.friend.poke")
					e[1].user_id = v[0]
				e && emitNoticeEvent(this, e[0], e[1])
			}
		}
		if (v[2] === 732) {
			const group_id = v[6].readUInt32BE()
			const type = v[6][4]
			if (typeof push732[type] === "function") {
				const e = push732[type].call(this, group_id, v[6])
				e && emitNoticeEvent(this, e[0], e[1])
			}
		}
	}
	handleOnlinePush.call(this, nested[3], seq, rubbish)
}

export function onlinePushTransListener(this: Client, payload: Buffer, seq: number) {
	const push = pb.decode(payload)
	handleOnlinePush.call(this, push[11], seq)
	if (!this._sync_cookie) return
	const buf = push[10].toBuffer()
	const group_id = buf.readUInt32BE()
	if (push[3] === 44) {
		if (buf[5] === 0 || buf[5] === 1) {
			const user_id = buf.readUInt32BE(6)
			const set = buf[10] > 0
			const info = this.gml.get(group_id)?.get(user_id)
			info && (info.role = (set ? "admin" : "member"))
			emitNoticeEvent(this, "notice.group.admin", {
				group_id, user_id, set
			})
		} else if (buf[5] === 0xFF) {
			const operator_id = buf.readUInt32BE(6)
			const user_id = buf.readUInt32BE(10)
			const i1 = this.gml.get(group_id)?.get(operator_id)
			const i2 = this.gml.get(group_id)?.get(user_id)
			i1 && (i1.role = "member")
			i2 && (i2.role = "owner")
			emitNoticeEvent(this, "notice.group.transfer", {
				group_id, operator_id, user_id
			})
		}
	}
	if (push[3] === 34) {
		const user_id = buf.readUInt32BE(5)
		let operator_id, dismiss = false, group
		let member = this.gml.get(group_id)?.get(user_id)
		if (buf[9] === 0x82 || buf[9] === 0x2) {
			operator_id = user_id
			this.gml.get(group_id)?.delete(user_id)
		} else {
			operator_id = buf.readUInt32BE(10)
			if (buf[9] === 0x01 || buf[9] === 0x81)
				dismiss = true
			if (user_id === this.uin) {
				group = this.gl.get(group_id)
				this.gl.delete(group_id)
				this.gml.delete(group_id)
				this.logger.info(`更新了群列表，删除了群：${group_id}`)
			} else {
				this.gml.get(group_id)?.delete(user_id)
				this.logger.info(`${user_id}离开了群${group_id}`)
			}
		}
		emitNoticeEvent(this, "notice.group.decrease", {
			group_id, user_id, operator_id, dismiss, member, group
		})
		this.gl.get(group_id)!.member_count--
	}
}

export function dmMsgSyncListener(this: Client, payload: Buffer, seq: number) {
	const proto = pb.decode(payload)
	handleOnlinePush.call(this, proto[2], seq)
	this.em("sync.message", new PrivateMessage(proto[1], this.uin))
}

const fragmap = new Map<string, GroupMessage[]>()

export function groupMsgListener(this: Client, payload: Buffer) {
	this.stat.recv_msg_cnt++
	if (!this._sync_cookie) return
	let msg = new GroupMessage(pb.decode(payload)[1])
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
		msg = GroupMessage.combine(arr) as GroupMessage
	}

	this.pickGroup(msg.group_id).info
	this.config.cache_group_member && this.pickMember(msg.group_id, msg.sender.user_id).info

	if (msg.raw_message) {
		(msg as GroupMessageEvent).reply = (content, quote = false) => {
			return this.pickGroup(msg.group_id).sendMsg(content, quote ? msg : undefined)
		}
		const sender = msg.sender
		const member = this.gml.get(msg.group_id)?.get(sender.user_id)
		if (member) {
			sender.nickname = member.nickname
			sender.sex = member.sex
			sender.age = member.age
			sender.area = member.area || ""
			member.card = sender.card
			member.title = sender.title
			member.level = sender.level
			member.last_sent_time = timestamp()
		}
		this.logger.info(`recv from: [Group: ${msg.group_name}(${msg.group_id}), Member: ${sender.card || sender.nickname}(${sender.user_id})] ` + msg)
		this.em("message.group." + msg.sub_type, msg)
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
		const _ = this.pickDiscuss(msg.discuss_id)
		msg.reply = _.sendMsg.bind(_)
		this.logger.info(`recv from: [Discuss: ${msg.discuss_name}(${msg.discuss_id}), Member: ${msg.sender.card}(${msg.sender.user_id})] ` + msg)
		this.em("message.discuss", msg)
	}
}
