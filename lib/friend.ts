import { randomBytes } from "crypto"
import { pb, jce } from "./core"
import { ErrorCode, drop } from "./errors"
import { Gender, PB_CONTENT, code2uin, timestamp, log } from "./common"
import { Sendable, PrivateMessage, Image, buildMusic, MusicPlatform, Quotable, rand2uuid, genDmMessageId, parseDmMessageId } from "./message"
import { buildSyncCookie, Contactable } from "./internal"
import { MessageRet } from "./events"
import { FriendInfo } from "./entities"

type Client = import("./client").Client

const weakmap = new WeakMap<FriendInfo, Friend>()

/** 联系人 */
export interface Contact {
	recallMessage(msg: PrivateMessage): Promise<boolean>
	recallMessage(msgid: string): Promise<boolean>
	recallMessage(seq: number, rand: number, time: number): Promise<boolean>
}

/** 联系人 */
export class Contact extends Contactable {

	/** this.uid的别名 */
	get user_id() {
		return this.uid
	}

	/** 创建一个联系人对象 */
	static as(this: Client, uid: number) {
		return new Contact(this, Number(uid))
	}

	protected constructor(c: Client, public readonly uid: number) {
		super(c)
	}

	/** 获取作为好友的对象实例 */
	asFriend() {
		return this.c.asFriend(this.uid)
	}

	/** 获取作为某群群员的对象实例 */
	asMember(gid: number) {
		return this.c.asMember(gid, this.uid)
	}

	/** 获取头像url */
	getAvatarUrl(size: 0 | 40 | 100 | 140 = 0) {
		return `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=` + this.uid
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
		for (const proto of obj[6]) {
			try {
				messages.push(new PrivateMessage(proto, this.c.uin))
			} catch { }
		}
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
		const payload = await this.c.sendUni("PbMessageSvc.PbMsgWithDraw", body)
		return pb.decode(payload)[1][1] <= 2
	}

	/** 发送音乐分享 */
	async shareMusic(platform: MusicPlatform, id: string) {
		const body = await buildMusic(this.uid, platform, id, 0)
		await this.c.sendOidb("OidbSvc.0xb77_9", pb.encode(body))
	}

	protected _getRouting(): pb.Encodable {
		if (Reflect.has(this, "gid"))
			return { 3: {
				1: code2uin(Reflect.get(this, "gid")),
				2: this.uid,
			} }
		return { 1: { 1: this.uid } }
	}

	/** 发送一条消息 */
	async sendMessage(content: Sendable, source?: Quotable): Promise<MessageRet> {
		const { rich, brief } = await this._preprocess(content, source)
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

	/** 获取离线文件下载地址 */
	async fetchOfflineFileDownloadUrl(fid: string) {
		const body = pb.encode({
			1: 1200,
			14: {
				10: this.c.uin,
				20: fid,
				30: 2
			},
			101: 3,
			102: 104,
			99999: { 1: 90200 }
		})
		const payload = await this.c.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_DOWNLOAD-1200", body)
		const rsp = pb.decode(payload)[14]
		if (rsp[10] !== 0)
			drop(ErrorCode.OfflineFileNotExists, rsp[20])
		const obj = rsp[30]
		let url = String(obj[50])
		if (!url.startsWith("http"))
			url = `http://${obj[30]}:${obj[40]}` + url
		return url
	}
}

/** 好友(继承联系人) */
export class Friend extends Contact {

	/** 创建一个好友对象，若uid相同则每次返回同一对象，不会重复创建 */
	static as(this: Client, uid: number) {
		const info = this.fl.get(uid)
		let friend = weakmap.get(info!)
		if (friend) return friend
		friend = new Friend(this, Number(uid), info)
		if (info) 
			weakmap.set(info, friend)
		return friend
	}

	/** 好友资料 */
	get info() {
		return this._info
	}

	get nickname() {
		return this._info?.nickname
	}
	get sex() {
		return this._info?.sex
	}
	get remark() {
		return this._info?.remark
	}
	get class_id() {
		return this._info?.class_id
	}
	get class_name() {
		return this.c.self.class.get(this._info?.class_id!)
	}

	protected constructor(c: Client, uid: number, protected _info?: FriendInfo) {
		super(c, uid)
	}

	/** 设置备注 */
	async setRemark(remark: string) {
		const req = jce.encodeStruct([ this.uid, String(remark || "") ])
		const body = jce.encodeWrapper({ req }, "KQQ.ProfileService.ProfileServantObj", "ChangeFriendName")
		await this.c.sendUni("ProfileService.ChangeFriendName", body)
	}

	/** 设置分组(注意：如果分组id不存在也会成功) */
	async setClass(id: number) {
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
