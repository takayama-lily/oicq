import { randomBytes } from "crypto"
import { Readable } from "stream"
import fs from "fs"
import path from "path"
import { pb, jce } from "./core"
import { ErrorCode, drop } from "./errors"
import { Gender, PB_CONTENT, code2uin, timestamp, lock, hide, fileHash, md5, sha, log } from "./common"
import { Sendable, PrivateMessage, buildMusic, MusicPlatform, Quotable, rand2uuid, genDmMessageId, parseDmMessageId, FileElem } from "./message"
import { buildSyncCookie, Contactable, highwayHttpUpload, CmdID } from "./internal"
import { MessageRet } from "./events"
import { FriendInfo } from "./entities"

type Client = import("./client").Client

const weakmap = new WeakMap<FriendInfo, Friend>()

export interface User {
	/** 撤回消息 */
	recallMsg(msg: PrivateMessage): Promise<boolean>
	recallMsg(msgid: string): Promise<boolean>
	recallMsg(seq: number, rand: number, time: number): Promise<boolean>
}

export class User extends Contactable {

	/** `this.uid`的别名 */
	get user_id() {
		return this.uid
	}

	static as(this: Client, uid: number) {
		return new User(this, Number(uid))
	}

	protected constructor(c: Client, public readonly uid: number) {
		super(c)
		lock(this, "uid")
	}

	/** 返回作为好友的实例 */
	asFriend(strict = false) {
		return this.c.pickFriend(this.uid, strict)
	}

	/** 返回作为某群群员的实例 */
	asMember(gid: number, strict = false) {
		return this.c.pickMember(gid, this.uid, strict)
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

	/** 获取`time`往前的`cnt`条聊天记录，默认当前时间，`cnt`默认20不能超过20 */
	async getChatHistory(time = timestamp(), cnt = 20) {
		if (cnt > 20) cnt = 20
		const body = pb.encode({
			1: this.uid,
			2: Number(time),
			3: 0,
			4: Number(cnt)
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

	/** 标记`time`之前为已读，默认当前时间 */
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

	async recallMsg(param: number | string | PrivateMessage, rand = 0, time = 0) {
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
					3: Number(seq),
					4: rand2uuid(Number(rand)),
					5: Number(time),
					6: Number(rand),
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

	private _getRouting(file = false): pb.Encodable {
		if (Reflect.has(this, "gid"))
			return { 3: {
				1: code2uin(Reflect.get(this, "gid")!),
				2: this.uid,
			} }
		return file ? { 15: { 1: this.uid, 2: 4 } } : { 1: { 1: this.uid } }
	}

	/**
	 * 发送一条消息
	 * @param source 引用回复的消息
	 */
	async sendMsg(content: Sendable, source?: Quotable): Promise<MessageRet> {
		const { rich, brief } = await this._preprocess(content, source)
		return this._sendMsg({ 1: rich }, brief)
	}

	protected async _sendMsg(proto3: pb.Encodable, brief: string, file = false) {
		const seq = this.c.sig.seq + 1
		const rand = randomBytes(4).readUInt32BE()
		const body = pb.encode({
			1: this._getRouting(file),
			2: PB_CONTENT,
			3: proto3,
			4: seq,
			5: rand,
			6: buildSyncCookie(this.c.sig.session.readUInt32BE()),
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
	async setFriendReq(seq: number, yes = true, remark = "", block = false) {
		const body = pb.encode({
			1: 1,
			2: Number(seq),
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
	async setGroupReq(gid: number, seq: number, yes = true, reason = "", block = false) {
		const body = pb.encode({
			1: 1,
			2: Number(seq),
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
	async setGroupInvite(gid: number, seq: number, yes = true, block = false) {
		const body = pb.encode({
			1: 1,
			2: Number(seq),
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

	async getFileInfo(fid: string) {
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
		return {
			name: String(rsp[40][7]),
			fid: String(rsp[40][6]),
			md5: rsp[40][100].toHex(),
			size: rsp[40][3] as number,
			duration: rsp[40][4] as number,
			url,
		} as Omit<FileElem, "type"> & Record<"url", string>
	}

	/** 获取离线文件下载地址 */
	async getFileUrl(fid: string) {
		return (await this.getFileInfo(fid)).url
	}
}

/** 好友(继承User) */
export class Friend extends User {

	static as(this: Client, uid: number, strict = false) {
		const info = this.fl.get(uid)
		if (strict && !info)
			throw new Error(uid + `不是你的好友`)
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
		return this.info?.nickname
	}
	get sex() {
		return this.info?.sex
	}
	get remark() {
		return this.info?.remark
	}
	get class_id() {
		return this.info?.class_id
	}
	get class_name() {
		return this.c.classes.get(this.info?.class_id!)
	}

	protected constructor(c: Client, uid: number, private _info?: FriendInfo) {
		super(c, uid)
		hide(this, "_info")
	}

	/** 发送音乐分享 */
	async shareMusic(platform: MusicPlatform, id: string) {
		const body = await buildMusic(this.uid, platform, id, 0)
		await this.c.sendOidb("OidbSvc.0xb77_9", pb.encode(body))
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
		buf.writeUInt32BE(this.uid, 3)
		buf[7] = Number(id)
		const MovGroupMemReq = jce.encodeStruct([
			this.c.uin, 0, buf
		])
		const body = jce.encodeWrapper({ MovGroupMemReq }, "mqq.IMService.FriendListServiceServantObj", "MovGroupMemReq")
		await this.c.sendUni("friendlist.MovGroupMemReq", body)
	}

	/** 点赞，默认一次 */
	async thumbUp(times = 1) {
		if (times > 20) times = 20
		const ReqFavorite = jce.encodeStruct([
			jce.encodeNested([
				this.c.uin, 1, this.c.sig.seq + 1, 1, 0, Buffer.from("0C180001060131160131", "hex")
			]),
			this.uid, 0, 1, Number(times)
		])
		const body = jce.encodeWrapper({ ReqFavorite }, "VisitorSvc", "ReqFavorite")
		const payload = await this.c.sendUni("VisitorSvc.ReqFavorite", body)
		return jce.decodeWrapper(payload)[0][3] === 0
	}

	/** 戳一戳 */
	async poke(self = false) {
		const body = pb.encode({
			1: self ? this.c.uin : this.uid,
			5: this.uid,
		})
		const payload = await this.c.sendOidb("OidbSvc.0xed3", body)
		return pb.decode(payload)[3] === 0
	}

	/** 删除好友，`block`默认为`true` */
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

	/**
	 * 发送离线文件
	 * @param file 一个文件路径，或者一块Buffer
	 * @param filename 对方看到的文件名(file为Buffer时，若留空则自动以md5命名)
	 * @param callback 监控上传进度的回调函数，拥有一个"百分比进度"的参数
	 * @returns 文件id(撤回时使用)
	 */
	async sendFile(file: string | Buffer | Uint8Array, filename?: string, callback?: (percentage: string) => void) {
		let filesize: number, filemd5: Buffer, filesha: Buffer, filestream: Readable
		if (file instanceof Uint8Array) {
			if (!Buffer.isBuffer(file))
				file = Buffer.from(file)
			filesize = file.length
			filemd5 = md5(file), filesha = sha(file)
			filename = filename ? String(filename) : ("file" + filemd5.toString("hex"))
			filestream = Readable.from(file, { objectMode: false, highWaterMark: 524288 })
		} else {
			file = String(file)
			filesize = (await fs.promises.stat(file)).size
			;[filemd5, filesha] = await fileHash(file)
			filename = filename ? String(filename) : path.basename(file)
			filestream = fs.createReadStream(file, { highWaterMark: 524288 })
		}
		const body1700 = pb.encode({
			1: 1700,
			2: 6,
			19: {
				10: this.c.uin,
				20: this.uid,
				30: filesize,
				40: filename,
				50: filemd5,
				60: filesha,
				70: "/storage/emulated/0/Android/data/com.tencent.mobileqq/Tencent/QQfile_recv/" + filename,
				80: 0,
				90: 0,
				100: 0,
				110: filemd5,
			},
			101: 3,
			102: 104,
			200: 1,
		})
		const payload = await this.c.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_UPLOAD_V3-1700", body1700)
		const rsp1700 = pb.decode(payload)[19]

		if (rsp1700[10] !== 0)
			drop(rsp1700[10], rsp1700[20])

		const fid = rsp1700[90].toBuffer() as Buffer

		if (!rsp1700[110]) {
			const ext = pb.encode({
				1: 100,
				2: 2,
				100: {
					100: {
						1: 3,
						100: this.c.uin,
						200: this.uid,
						400: 0,
						700: payload,
					},
					200: {
						100: filesize,
						200: filemd5,
						300: filesha,
						400: filemd5,
						600: fid,
						700: rsp1700[220].toBuffer(),
					},
					300: {
						100: 2,
						200: String(this.c.apk.subid),
						300: 2,
						400: "d92615c5",
						600: 4,
					},
					400: {
						100: filename,
					},
				},
				200: 1
			})
			await highwayHttpUpload.call(this.c, filestream, {
				md5: filemd5,
				size: filesize,
				cmdid: CmdID.OfflineFile,
				ext, callback
			})
		}

		const body800 = pb.encode({
			1: 800,
			2: 7,
			10: {
				10: this.c.uin,
				20: this.uid,
				30: fid,
			},
			101: 3,
			102: 104,
		})
		await this.c.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_UPLOAD_SUCC-800", body800)
		const proto3 = {
			2: {
				1: {
					1: 0,
					3: fid,
					4: filemd5,
					5: filename,
					6: filesize,
					9: 1,
				}
			}
		}
		await this._sendMsg(proto3, `[文件：${filename}]`, true)
		return String(fid)
	}

	/** 撤回离线文件 */
	async recallFile(fid: string) {
		const body = pb.encode({
			1: 400,
			2: 0,
			6: {
				1: this.c.uin,
				2: fid
			},
			101: 3,
			102: 104,
			200: 1,
		})
		const payload = await this.c.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_RECALL-400", body)
		const rsp = pb.decode(payload)[6]
		return rsp[1] === 0
	}

	/** 转发离线文件 */
	async forwardFile(fid: string) {
		const body = pb.encode({
			1: 700,
			2: 0,
			9: {
				10: this.c.uin,
				20: this.uid,
				30: fid
			},
			101: 3,
			102: 104,
			200: 1,
		})
		const payload = await this.c.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_FORWARD_FILE-700", body)
		const rsp = pb.decode(payload)[9]
		const new_fid = rsp[50]
		const ticket = rsp[60]

		if (rsp[10] !== 0)
			drop(rsp[10], rsp[20])

		const info = await this.getFileInfo(fid)

		const proto3 = {
			2: {
				1: {
					1: 0,
					3: new_fid,
					4: Buffer.from(info.md5, "hex"),
					5: info.name,
					6: info.size,
					9: 1,
					57: ticket
				}
			}
		}
		await this._sendMsg(proto3, `[文件：${info.name}]`, true)
		return String(new_fid)
	}
}
