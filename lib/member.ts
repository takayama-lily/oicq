import { pb, jce } from "./core"
import { ErrorCode, drop } from "./errors"
import { timestamp, parseFunString, NOOP } from "./common"
import { MemberInfo } from "./entities"
import { User } from "./friend"

type Client = import("./client").Client

const weakmap = new WeakMap<MemberInfo, Member>()

/** @ts-ignore ts(2417) 群员(继承联系人) */
export class Member extends User {

	/** 创建一个群员对象，若gid,uid相同，且默认开启群员列表缓存，则每次返回同一对象，不会重复创建 */
	static as(this: Client, gid: number, uid: number) {
		const info = this.gml.get(gid)?.get(uid)
		let member = weakmap.get(info!)
		if (member) return member
		member = new Member(this, Number(gid), Number(uid), info)
		if (info) 
			weakmap.set(info, member)
		return member
	}

	/** 群员资料 */
	get info() {
		if (!this.c.config.cache_group_member) return this._info
		if (!this._info || timestamp() - this._info?.update_time! >= 900)
			this.fetchInfo().catch(NOOP)
		return this._info
	}

	get card() {
		return this.info?.card || this._info?.nickname
	}
	get title() {
		return this._info?.title
	}
	get is_friend() {
		return this.c.fl.has(this.uid)
	}
	get is_owner() {
		return this._info?.role === "owner"
	}
	get is_admin() {
		return this._info?.role === "owner" || this._info?.role === "admin"
	}
	get mute_left() {
		const t = this._info?.shutup_time! - timestamp()
		return t > 0 ? t : 0
	}

	/** 获取所在群的对象实例 */
	get group() {
		return this.c.asGroup(this.gid)
	}

	protected constructor(c: Client, public readonly gid: number, uid: number, protected _info?: MemberInfo) {
		super(c, uid)
	}

	/** 强制刷新资料 */
	async fetchInfo(): Promise<MemberInfo> {
		if (!this.c.gml.has(this.gid) && this.c.config.cache_group_member)
			this.group.getMemberList()
		const body = pb.encode({
			1: this.gid,
			2: this.uid,
			3: 1,
			4: 1,
			5: 1,
		})
		const payload = await this.c.sendUni("group_member_card.get_group_member_card_info", body)
		const proto = pb.decode(payload)[3]
		if (!proto[27]) {
			this.c.gml.get(this.gid)?.delete(this.uid)
			drop(ErrorCode.MemberNotExists)
		}
		const card = proto[8] ? parseFunString(proto[8].toBuffer()) : ""
		let info: MemberInfo = {
			group_id: this.gid,
			user_id: this.uid,
			nickname: proto[11]?.toString() || "",
			card: card,
			sex: proto[9] === 0 ? "male" : (proto[9] === 1 ? "female" : "unknown"),
			age: proto[12] || 0,
			area: proto[10]?.toString() || "",
			join_time: proto[14],
			last_sent_time: proto[15],
			level: proto[39],
			rank: Reflect.has(proto, "13") ? String(proto[13]) : "",
			role: proto[27] === 3 ? "owner" : (proto[27] === 2 ? "admin" : "member"),
			title: Reflect.has(proto, "31") ? String(proto[31]) : "",
			title_expire_time: Reflect.has(proto, "32") ? proto[32] : 0xffffffff,
			shutup_time: this.c.gml.get(this.gid)?.get(this.uid)?.shutup_time || 0,
			update_time: timestamp(),
		}
		info = Object.assign(this.c.gml.get(this.gid)?.get(this.uid) || this._info || { }, info)
		this.c.gml.get(this.gid)?.set(this.uid, info)
		this._info = info
		weakmap.set(info, this)
		return info
	}

	/** 设置/取消管理员 */
	async setAdmin(yes: boolean) {
		const buf = Buffer.allocUnsafe(9)
		buf.writeUInt32BE(this.gid)
		buf.writeUInt32BE(this.uid, 4)
		buf.writeUInt8(yes ? 1 : 0, 8)
		const payload = await this.c.sendOidb("OidbSvc.0x55c_1", buf)
		const ret = pb.decode(payload)[3] === 0
		if (ret) {
			setImmediate(async() => {
				const $old = (await this.c.gml.get(this.gid))?.get(this.uid)?.role
				const $new = yes ? "admin" : "member"
				if ($old && $old !== "owner" && $old !== $new) {
					(await this.c.gml.get(this.gid))!.get(this.uid)!.role = $new
					this.c.em("notice.group.admin", {
						group_id: this.gid,
						user_id: this.uid,
						set: !!yes,
					})
				}
			})
		}
		return ret
	}

	/** 设置头衔 */
	async setSpecialTitle(title: string, duration = -1) {
		const body = pb.encode({
			1: this.gid,
			3: {
				1: this.uid,
				7: String(title),
				5: String(title),
				6: Number(duration) || -1
			}
		})
		const payload = await this.c.sendOidb("OidbSvc.0x8fc_2", body)
		return pb.decode(payload)[3] === 0
	}

	/** 修改名片 */
	async setCard(card: string) {
		const MGCREQ = jce.encodeStruct([
			0, this.gid, 0, [
				jce.encodeNested([
					this.uid, 31, String(card), 0, "", "", ""
				])
			]
		])
		const body = jce.encodeWrapper({ MGCREQ }, "mqq.IMService.FriendListServiceServantObj", "ModifyGroupCardReq")
		const payload = await this.c.sendUni("friendlist.ModifyGroupCardReq", body)
		return jce.decodeWrapper(payload)[3].length > 0
	}

	/** 踢 */
	async kick(block = false) {
		const body = pb.encode({
			1: this.gid,
			2: {
				1: 5,
				2: this.uid,
				3: block ? 1 : 0,
			},
		})
		const payload = await this.c.sendOidb("OidbSvc.0x8a0_0", body)
		const ret = pb.decode(payload)[4][2][1] === 0
		if (ret) {
			setImmediate(async() => {
				const member = (await this.c.gml.get(this.gid))?.get(this.uid)
				;(await this.c.gml.get(this.gid))?.delete(this.uid) && this.c.em("notice.group.decrease", {
					group_id: this.gid,
					user_id: this.uid,
					operator_id: this.c.uin,
					dismiss: false,
					member
				})
			})
		}
		return ret
	}

	/** 禁言，默认1800秒 */
	async mute(duration = 1800) {
		if (duration > 2592000 || duration < 0)
			duration = 2592000
		const buf = Buffer.allocUnsafe(15)
		buf.writeUInt32BE(this.gid)
		buf.writeUInt8(32, 4)
		buf.writeUInt16BE(1, 5)
		buf.writeUInt32BE(this.uid, 7)
		buf.writeUInt32BE(Number(duration) || 0, 11)
		await this.c.sendOidb("OidbSvc.0x570_8", buf)
	}

	/** 戳一戳 */
	async poke() {
		const body = pb.encode({
			1: this.uid,
			2: this.gid
		})
		const payload = await this.c.sendOidb("OidbSvc.0xed3", body)
		return pb.decode(payload)[3] === 0
	}

	/** 加为好友 */
	async addFriend(comment = "") {
		const type = await this.getAddFriendSetting()
		if (![0, 1, 4].includes(type))
			return false
		comment = String(comment)
		const AF = jce.encodeStruct([
			this.c.uin,
			this.uid, type ? 1 : 0, 1, 0, Buffer.byteLength(comment), comment, 0, 1, null, 3004,
			11, null, null, this.gid ? pb.encode({ 1: this.gid }) : null, 0, null, null, 0
		])
		const body = jce.encodeWrapper({ AF }, "mqq.IMService.FriendListServiceServantObj", "AddFriendReq")
		const payload = await this.c.sendUni("friendlist.addFriend", body)
		return jce.decodeWrapper(payload)[6] === 0
	}
}
