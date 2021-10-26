import { pb, jce, Platform } from "../core"
import { drop } from "../errors"
import { timestamp, Gender, OnlineStatus, lock, log } from "../common"
import { Image, ImageElem } from "../message"
import { StrangerInfo, FriendInfo, GroupInfo, MemberInfo } from "../entities"
import { CmdID, highwayUpload } from "./highway"

type Client = import("../client").Client

export class Self {

	get uin() {
		return this.c.uin
	}

	/** 好友列表(务必以`ReadonlyMap`方式访问) */
	readonly fl = new Map<number, FriendInfo>()
	/** 陌生人列表(务必以`ReadonlyMap`方式访问) */
	readonly sl = new Map<number, StrangerInfo>()
	/** 群列表(务必以`ReadonlyMap`方式访问) */
	readonly gl = new Map<number, GroupInfo>()
	/** 群员列表缓存(务必以`ReadonlyMap`方式访问) */
	readonly gml = new Map<number, Map<number, MemberInfo>>()
	/** 黑名单列表(务必以`ReadonlySet`方式访问) */
	readonly blacklist = new Set<number>()

	/** 勿手动修改这些属性 */
	status: OnlineStatus = 0
	nickname = ""
	sex: Gender = "unknown"
	age = 0

	bid = ""
	/** 漫游表情 */
	stamp = new Set<string>()

	/** 好友分组 */
	class = new Map<number, string>()

	constructor(private c: Client) {
		lock(this, "c")
		lock(this, "fl")
		lock(this, "sl")
		lock(this, "gl")
		lock(this, "gml")
		lock(this, "blacklist")
	}

	/** 设置在线状态 */
	async setStatus(status = this.status || OnlineStatus.Online) {
		if (!status)
			return false
		if ([Platform.Watch, Platform.aPad].includes(this.c.config.platform as Platform))
			return false
		const d = this.c.device
		const SvcReqRegister = jce.encodeStruct([
			this.uin,
			7, 0, "", Number(status), 0, 0, 0, 0, 0, 248,
			d.version.sdk, 0, "", 0, null, d.guid, 2052, 0, d.model, d.model,
			d.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
			"", "", null, 1, null, 0, null, 0, 0
		])
		const body = jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister")
		const payload = await this.c.sendUni("StatSvc.SetStatusFromClient", body)
		const ret = jce.decode(payload)[9] === 0
		if (ret)
			this.status = status
		return ret
	}

	/** 设置昵称 */
	setNickname(nickname: string) {
		return this._setProfile(0x14E22, Buffer.from(String(nickname)))
	}
	/** 设置性别 */
	setGender(gender: Gender) {
		const g = gender === "male" ? 1 : (gender === "female" ? 2 : 0)
		return this._setProfile(0x14E29, Buffer.from([g]))
	}
	/** 设置生日 */
	setBirthday(year: number, month: number, day: number) {
		const buf = Buffer.allocUnsafe(4)
		buf.writeUInt16BE(Number(year))
		buf.writeUInt16BE(Number(month), 2)
		buf.writeUInt16BE(Number(day), 3)
		return this._setProfile(0x16593, buf)
	}
	/** 设置个人说明 */
	setDescription(description: string) {
		return this._setProfile(0x14E33, Buffer.from(String(description)))
	}

	private async _setProfile(k: number, v: Buffer) {
		const buf = Buffer.allocUnsafe(11 + v.length)
		buf.writeUInt32BE(this.uin)
		buf.writeUInt8(0, 4)
		buf.writeInt32BE(k, 5)
		buf.writeUInt16BE(v.length, 9)
		buf.fill(v, 11)
		const payload = await this.c.sendOidb("OidbSvc.0x4ff_9", buf)
		const obj = pb.decode(payload)
		return obj[3] === 0 || obj[3] === 34
	}

	/** 设置签名 */
	async setSignature(signature: string) {
		const buf = Buffer.from(String(signature)).slice(0, 254)
		const body = pb.encode({
			1: 2,
			2: Date.now(),
			3: {
				1: 109,
				2: { 6: 825110830 },
				3: this.c.apk.ver
			},
			5: {
				1: this.uin,
				2: 0,
				3: 27 + buf.length,
				4: Buffer.concat([
					Buffer.from([0x3, buf.length + 1, 0x20]), buf,
					Buffer.from([0x91, 0x04, 0x00, 0x00, 0x00, 0x00, 0x92, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA2, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA3, 0x04, 0x00, 0x00, 0x00, 0x00])
				]),
				5: 0
			},
			6: 1
		})
		const payload = await this.c.sendUni("Signature.auth", body)
		return pb.decode(payload)[1] === 0
	}

	/** 设置头像 */
	async setAvatar(file: ImageElem["file"]) {
		const img = new Image({ type: "image", file })
		await img.task
		const body = pb.encode({
			1281: {
				1: this.uin,
				2: 0,
				3: 16,
				4: 1,
				6: 3,
				7: 5,
			}
		})
		const payload = await this.c.sendUni("HttpConn.0x6ff_501", body)
		const rsp = pb.decode(payload)[1281]
		await highwayUpload.call(this.c, img.readable!, {
			cmdid: CmdID.SelfPortrait,
			md5: img.md5,
			size: img.size,
			ticket: rsp[1].toBuffer()
		}, rsp[3][2][0][2], rsp[3][2][0][3])
		img.deleteTmpFile()
	}

	/** 获取漫游表情 */
	async getRoamingStamp(no_cache = false) {
		if (this.stamp.size > 0 && !no_cache)
			return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`)
		const body = pb.encode({
			1: {
				1: 109,
				2: "7.1.2",
				3: this.c.apk.ver
			},
			2: this.uin,
			3: 1,
		})
		const payload = await this.c.sendUni("Faceroam.OpReq", body)
		const rsp = pb.decode(payload)
		if (rsp[1] !== 0)
			drop(rsp[1], rsp[2])
		if (rsp[4][1]) {
			this.bid = String(rsp[4][3])
			this.stamp = new Set((Array.isArray(rsp[4][1]) ? rsp[4][1] : [rsp[4][1]]).map(x => String(x)))
		} else {
			this.stamp = new Set
		}
		return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`)
	}

	/** 删除表情(id访问stamp获得，支持批量) */
	async deleteStamp(id: string | string[]) {
		const body = pb.encode({
			1: {
				1: 109,
				2: "7.1.2",
				3: this.c.apk.ver,
			},
			2: this.uin,
			3: 2,
			5: {
				1: id
			},
		})
		await this.c.sendUni("Faceroam.OpReq", body)
		for (let s of id)
			this.stamp.delete(s)
	}

	/** 添加好友分组 */
	async addClass(name: string) {
		const len = Buffer.byteLength(name)
		const buf = Buffer.allocUnsafe(2 + len)
		buf.writeUInt8(0xd)
		buf.writeUInt8(len, 1)
		buf.fill(name, 2)
		const SetGroupReq = jce.encodeStruct([
			0, this.uin, buf
		])
		const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
		await this.c.sendUni("friendlist.SetGroupReq", body)
	}

	/** 删除好友分组 */
	async deleteClass(id: number) {
		const SetGroupReq = jce.encodeStruct([
			2, this.uin, Buffer.from([id])
		])
		const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
		await this.c.sendUni("friendlist.SetGroupReq", body)
	}

	/** 重命名好友分组 */
	async renameClass(id: number, name: string) {
		const len = Buffer.byteLength(name)
		const buf = Buffer.allocUnsafe(2 + len)
		buf.writeUInt8(id)
		buf.writeUInt8(len, 1)
		buf.fill(name, 2)
		const SetGroupReq = jce.encodeStruct([
			1, this.uin, buf
		])
		const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
		await this.c.sendUni("friendlist.SetGroupReq", body)
	}

	/** 强制加载好友列表 */
	async loadFriendList() {
		const set = new Set<number>()
		let start = 0, limit = 150
		while (true) {
			const FL = jce.encodeStruct([
				3,
				1, this.uin, start, limit, 0,
				1, 0, 0, 0, 1,
				31, null, 0, 0, 0,
				d50, null, [13580, 13581, 13582]
			])
			const body = jce.encodeWrapper({ FL }, "mqq.IMService.FriendListServiceServantObj", "GetFriendListReq")
			const payload = await this.c.sendUni("friendlist.getFriendGroupList", body, 10)
			const nested = jce.decodeWrapper(payload)
			this.class.clear()
			for (let v of nested[14])
				this.class.set(v[0], v[1])
			for (let v of nested[7]) {
				const uid = v[0]
				const info = {
					user_id: uid,
					nickname: v[14] || "",
					sex: v[31] ? (v[31] === 1 ? "male" : "female") : "unknown" as Gender,
					remark: v[3] || "",
					class_id: v[1],
				}
				this.fl.set(uid, Object.assign(this.fl.get(uid) || { }, info))
				set.add(uid)
			}
			start += limit
			if (start > nested[5]) break
		}
		for (const [uid, _] of this.fl) {
			if (!set.has(uid))
				this.fl.delete(uid)
		}
	}

	/** 强制加载陌生人列表 */
	async loadStrangerList() {
		const body = pb.encode({
			1: 1,
			2: {
				1: this.c.sig.seq + 1
			}
		})
		const payload = await this.c.sendOidb("OidbSvc.0x5d2_0", body, 10)
		let protos = pb.decode(payload)[4][2][2]
		if (!protos) return
		if (!Array.isArray(protos))
			protos = [protos]
		const set = new Set<number>()
		for (const proto of protos) {
			this.sl.set(proto[1], {
				user_id: proto[1],
				nickname: String(proto[2]),
			})
			set.add(proto[1])
		}
		for (const [uid, _] of this.sl) {
			if (!set.has(uid))
				this.sl.delete(uid)
		}
	}

	/** 强制加载群列表 */
	async loadGroupList() {
		const GetTroopListReqV2Simplify = jce.encodeStruct([
			this.uin, 0, null, [], 1, 8, 0, 1, 1
		])
		const body = jce.encodeWrapper({ GetTroopListReqV2Simplify }, "mqq.IMService.FriendListServiceServantObj", "GetTroopListReqV2Simplify")
		const payload = await this.c.sendUni("friendlist.GetTroopListReqV2", body, 10)
		const nested = jce.decodeWrapper(payload)
		const set = new Set<number>()
		for (let v of nested[5]) {
			const gid = v[1]
			const info = {
				group_id: gid,
				group_name: v[4] || "",
				member_count: v[19],
				max_member_count: v[29],
				owner_id: v[23],
				last_join_time: v[27],
				shutup_time_whole: v[9] ? 0xffffffff : 0,
				shutup_time_me: v[10] > timestamp() ? v[10] : 0,
				update_time: 0,
			}
			this.gl.set(gid, Object.assign(this.gl.get(gid) || { }, info))
			set.add(gid)
		}
		for (const [gid, _] of this.gl) {
			if (!set.has(gid)) {
				this.gl.delete(gid)
				this.gml.delete(gid)
			}
		}
	}

	/** 强制加载黑名单 */
	async loadBlackList() {
		let body = pb.encode({
			1: {
				1: this.uin,
				3: 0,
				4: 1000,
			}
		})
		let len = Buffer.allocUnsafe(4)
		len.writeUInt32BE(body.length)
		body = Buffer.concat([Buffer.alloc(4), len, body])
		const payload = await this.c.sendUni("SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList", body)
		let protos = pb.decode(payload.slice(8))[1][6]
		this.blacklist.clear()
		if (!protos) return
		if (!Array.isArray(protos))
			protos = [protos]
		for (let proto of protos)
			this.blacklist.add(proto[1])
	}
}

const d50 = pb.encode({
	1: 10002,
	91001: 1,
	101001: 1,
	151001: 1,
	181001: 1,
	251001: 1,
})
