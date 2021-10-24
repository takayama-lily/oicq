import { randomBytes } from "crypto"
import { pb, jce } from "./core"
import { ErrorCode, drop } from "./errors"
import { Gender, PB_CONTENT, code2uin, timestamp, log } from "./common"
import { Sendable, PrivateMessage, Image, buildMusic, MusicPlatform, Converter, rand2uuid, genDmMessageId, parseDmMessageId } from "./message"
import { buildSyncCookie, ShitMountain } from "./internal"
import { MessageRet } from "./events"
import { FriendInfo } from "./entities"

type Client = import("./client").Client

const weakmap = new WeakMap<FriendInfo, Friend>()

export interface User {
	recallMessage(msg: PrivateMessage): Promise<boolean>
	recallMessage(msgid: string): Promise<boolean>
	recallMessage(seq: number, rand: number, time: number): Promise<boolean>
}

export class User extends ShitMountain {

	static as(this: Client, uid: number) {
		return new User(this, Number(uid))
	}

	protected constructor(c: Client, public readonly uid: number) {
		super(c)
	}

	async getAddFriendSetting() {
		const FS = jce.encodeStruct([
			this.c.uin, this.uid, 3004, 0, null, 1
		])
		const body = jce.encodeWrapper({ FS }, "mqq.IMService.FriendListServiceServantObj", "GetUserAddFriendSettingReq")
		const payload = await this.c.sendUni("friendlist.getUserAddFriendSetting", body)
		return jce.decodeWrapper(payload)[2] as number
	}

	/** 查看资料 */
	async getSimpleInfo() {
		const arr = [
			null,
			0, "", [this.uid], 1, 1,
			0, 0, 0, 1, 0, 1
		]
		arr[101] = 1
		const req = jce.encodeStruct(arr)
		const body = jce.encodeWrapper({ req }, "KQQ.ProfileService.ProfileServantObj", "GetSimpleInfo")
		const payload = await this.c.sendUni("ProfileService.GetSimpleInfo", body)
		const nested = jce.decodeWrapper(payload)
		for (let v of nested) {
			return {
				user_id: v[1] as number,
				nickname: (v[5] || "") as string,
				sex: (v[3] ? (v[3] === -1 ? "unknown" : "female") : "male") as Gender,
				age: (v[4] || 0) as number,
				area: (v[13] + " " + v[14] + " " + v[15]).trim(),
			}
		}
		drop(ErrorCode.UserNotExists)
	}

	/** 获取time往前的cnt条聊天记录，time默认当前时间，cnt默认20不能超过20 */
	async getChatHistory(time = timestamp(), cnt = 20) {
		const body = pb.encode({
			1: this.uid,
			2: Number(time),
			3: 0,
			4: cnt
		})
		const payload = await this.c.sendUni("MessageSvc.PbGetOneDayRoamMsg", body)
		const obj = pb.decode(payload), messages: PrivateMessage[] = []
		if (obj[1] > 0 || !obj[6])
			return messages
		!Array.isArray(obj[6]) && (obj[6] = [obj[6]])
		for (const proto of obj[6])
			messages.push(new PrivateMessage(proto, this.c.uin))
		return messages
	}

	/** 标记time之前为已读，time默认当前时间 */
	async markRead(time = timestamp()) {
		const body = pb.encode({
			3: {
				2: {
					1: this.uid,
					2: Number(time)
				}
			}
		})
		await this.c.sendUni("PbMessageSvc.PbMsgReadedReport", body)
	}

	/** 撤回一条消息 */
	async recallMessage(param: number | string | PrivateMessage, rand = 0, time = 0) {
		if (param instanceof PrivateMessage)
			var { seq, rand, time } = param
		else if (typeof param === "string")
			var { seq, rand, time } = parseDmMessageId(param)
		else
			var seq = param
		const body = pb.encode({
			1: [{
				1: [{
					1: this.c.uin,
					2: this.uid,
					3: seq,
					4: rand2uuid(rand),
					5: time,
					6: rand,
				}],
				2: 0,
				3: {
					1: this.c.fl.has(this.uid) || this.c.sl.has(this.uid) ? 0 : 1
				},
				4: 1,
			}]
		})
		const payload = await this.c.sendOidb("PbMessageSvc.PbMsgWithDraw", body)
		return pb.decode(payload)[1][1] <= 2
	}

	/** 发送音乐分享 */
	async shareMusic(platform: MusicPlatform, id: string) {
		const body = await buildMusic(this.uid, platform, id, 0)
		await this.c.sendOidb("OidbSvc.0xb77_9", pb.encode(body))
	}

	private _getRouting(): pb.Encodable {
		if (Reflect.has(this, "gid"))
			return { 3: {
				1: code2uin(Reflect.get(this, "gid")),
				2: this.uid,
			} }
		return { 1: { 1: this.uid } }
	}

	/** 发送一条消息 */
	async sendMessage(content: Sendable): Promise<MessageRet> {
		const { rich, brief } = await this._preprocess(content)
		const seq = this.c.sig.seq + 1
		const rand = randomBytes(4).readUInt32BE()
		const body = pb.encode({
			1: this._getRouting(),
			2: PB_CONTENT,
			3: { 1: rich },
			4: seq,
			5: rand,
			6: buildSyncCookie(this.c.sig.session.readUInt32BE()),
			8: 0
		})
		const payload = await this.c.sendUni("MessageSvc.PbSendMsg", body)
		const rsp = pb.decode(payload)
		if (rsp[1] !== 0) {
			this.c.logger.error(`failed to send: [Private: ${this.uid}] ${rsp[2]}(${rsp[1]})`)
			drop(rsp[1], rsp[2])
		}
		this.c.logger.info(`succeed to send: [Private(${this.uid})] ` + brief)
		const time = rsp[3]
		const message_id = genDmMessageId(this.uid, seq, rand, rsp[3], 1)
		return { message_id, seq, rand, time }
	}

	/** 回添双向好友 */
	async addFriendBack(seq: number, remark = "") {
		const body = pb.encode({
			1: 1,
			2: Number(seq),
			3: this.uid,
			4: 10,
			5: 2004,
			6: 1,
			7: 0,
			8: {
				1: 2,
				52: String(remark),
			},
		})
		const payload = await this.c.sendUni("ProfileService.Pb.ReqSystemMsgAction.Friend", body)
		return pb.decode(payload)[1][1] === 0
	}

	/** 同意好友申请 */
	async approveFriendRequest(seq: number, yes = true, remark = "", block = false) {
		const body = pb.encode({
			1: 1,
			2: seq,
			3: this.uid,
			4: 1,
			5: 6,
			6: 7,
			8: {
				1: yes ? 2 : 3,
				52: String(remark),
				53: block ? 1 : 0
			},
		})
		const payload = await this.c.sendUni("ProfileService.Pb.ReqSystemMsgAction.Friend", body)
		return pb.decode(payload)[1][1] === 0
	}

	/** 同意入群申请 */
	async approveGroupRequest(gid: number, seq: number, yes = true, reason = "", block = false) {
		const body = pb.encode({
			1: 1,
			2: seq,
			3: this.uid,
			4: 1,
			5: 3,
			6: 31,
			7: 1,
			8: {
				1: yes ? 11 : 12,
				2: Number(gid),
				50: String(reason),
				53: block ? 1 : 0,
			},
		})
		const payload = await this.c.sendUni("ProfileService.Pb.ReqSystemMsgAction.Group", body)
		return pb.decode(payload)[1][1] === 0
	}

	/** 同意群邀请 */
	async approveGroupInvitation(gid: number, seq: number, yes = true, block = false) {
		const body = pb.encode({
			1: 1,
			2: seq,
			3: this.uid,
			4: 1,
			5: 3,
			6: 10016,
			7: 2,
			8: {
				1: yes ? 11 : 12,
				2: Number(gid),
				53: block ? 1 : 0,
			},
		})
		const payload = await this.c.sendUni("ProfileService.Pb.ReqSystemMsgAction.Group", body)
		return pb.decode(payload)[1][1] === 0
	}
}

export class Friend extends User {

	get info() {
		return this._info
	}

	/** 若uid相同则每次返回同一对象 */
	static as(this: Client, uid: number) {
		const info = this.fl.get(uid)
		let friend = weakmap.get(info!)
		if (friend) return friend
		friend = new Friend(this, Number(uid), info)
		if (info) 
			weakmap.set(info, friend)
		return friend
	}

	private constructor(c: Client, uid: number, private _info?: FriendInfo) {
		super(c, uid)
	}

	/** 设置备注 */
	async setRemark(remark: string) {
		const req = jce.encodeStruct([ this.uid, String(remark || "") ])
		const body = jce.encodeWrapper({ req }, "KQQ.ProfileService.ProfileServantObj", "ChangeFriendName")
		await this.c.sendUni("ProfileService.ChangeFriendName", body)
	}

	/** 设置分组(注意：如果分组id不存在也会成功) */
	async setGrouping(id: number) {
		const buf = Buffer.alloc(10)
		buf[0] = 1, buf[2] = 5
		buf.writeUInt32BE(this.uid, 3), buf[7] = id
		const MovGroupMemReq = jce.encodeStruct([
			this.c.uin, 0, buf
		])
		const body = jce.encodeWrapper({ MovGroupMemReq }, "mqq.IMService.FriendListServiceServantObj", "MovGroupMemReq")
		await this.c.sendUni("friendlist.MovGroupMemReq", body)
	}

	/** 点赞，默认一次 */
	async thumbUp(times = 1) {
		times = Number(times)
		if (!(times > 0 && times <= 20))
			times = 1
		const ReqFavorite = jce.encodeStruct([
			jce.encodeNested([
				this.c.uin, 1, this.c.sig.seq + 1, 1, 0, Buffer.from("0C180001060131160131", "hex")
			]),
			this.uid, 0, 1, times
		])
		const body = jce.encodeWrapper({ ReqFavorite }, "VisitorSvc", "ReqFavorite")
		const payload = await this.c.sendUni("VisitorSvc.ReqFavorite", body)
		return jce.decodeWrapper(payload)[0][3] === 0
	}

	/** 戳一戳 */
	async poke(uid = this.uid) {
		const body = pb.encode({
			1: Number(uid),
			5: this.uid,
		})
		const payload = await this.c.sendOidb("OidbSvc.0xed3", body)
		return pb.decode(payload)[3] === 0
	}

	/** 删除好友，block默认为true */
	async delete(block = true) {
		const DF = jce.encodeStruct([
			this.c.uin,
			this.uid, 2, block ? 1 : 0
		])
		const body = jce.encodeWrapper({ DF }, "mqq.IMService.FriendListServiceServantObj", "DelFriendReq")
		const payload = await this.c.sendUni("friendlist.delFriend", body)
		this.c.sl.delete(this.uid)
		return jce.decodeWrapper(payload)[2] === 0
	}
}
