import * as fs from "fs"
import * as path from "path"
import * as log4js from "log4js"
import { BaseClient, Platform, pb, generateShortDevice, ShortDevice, Domain } from "./core"
const pkg = require("../package.json")
import { md5, timestamp, NOOP, lock, Gender, OnlineStatus, hide } from "./common"
import { bindInternalListeners, parseFriendRequestFlag, parseGroupRequestFlag,
	getSysMsg, setAvatar, setSign, setStatus, addClass, delClass, renameClass,
	loadBL, loadFL, loadGL, loadSL, getStamp, delStamp, imageOcr, OcrResult } from "./internal"
import { StrangerInfo, FriendInfo, GroupInfo, MemberInfo } from "./entities"
import { EventMap } from "./events"
import { User, Friend } from "./friend"
import { Discuss, Group } from "./group"
import { Member } from "./member"
import { Forwardable, Quotable, Sendable, parseDmMessageId, parseGroupMessageId, Image, ImageElem} from "./message"

/** 事件接口 */
export interface Client extends BaseClient {
	on<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	on<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: this, ...args: any[]) => void): this
	once<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	once<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: this, ...args: any[]) => void): this
	prependListener<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	prependListener(event: string | symbol, listener: (this: this, ...args: any[]) => void): this
	prependOnceListener<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	prependOnceListener(event: string | symbol, listener: (this: this, ...args: any[]) => void): this
	off<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	off<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: this, ...args: any[]) => void): this
}

/** 一个客户端 */
export class Client extends BaseClient {

	/**
	 * 得到一个群对象, 通常不会重复创建，调用
	 * @param strict 严格模式，若群不存在会抛出异常
	 */
	readonly pickGroup = Group.as.bind(this)
	/** 得到一个好友对象, 通常不会重复创建 */
	readonly pickFriend = Friend.as.bind(this)
	/** 得到一个群员对象, 通常不会重复创建 */
	readonly pickMember = Member.as.bind(this)
	/** 创建一个用户对象 */
	readonly pickUser = User.as.bind(this)
	/** 创建一个讨论组对象 */
	readonly pickDiscuss = Discuss.as.bind(this)

	/** 日志记录器，初始情况下是`log4js.Logger` */
	logger: Logger | log4js.Logger
	/** 账号本地数据存储目录 */
	readonly dir: string
	/** 配置 */
	readonly config: Required<Config>

	protected readonly _cache = new Map<number, Set<string>>()
	protected _sync_cookie?: Uint8Array

	/** 密码的md5值，调用login后会保存在这里，用于token过期时恢复登录 */
	password_md5?: Buffer

	get [Symbol.toStringTag]() {
		return "OicqClient"
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
	/** 好友分组 */
	readonly classes = new Map<number, string>()

	/** 勿手动修改这些属性 */
	status: OnlineStatus = 0
	nickname = ""
	sex: Gender = "unknown"
	age = 0
	bid = ""
	/** 漫游表情缓存 */
	stamp = new Set<string>()
	/** 相当于频道中的qq号 */
	tiny_id = ""

	/** csrf token */
	get bkn() {
		let bkn = 5381
		for (let v of this.sig.skey)
			bkn = bkn + (bkn << 5) + v
		bkn &= 2147483647
		return bkn
	}
	readonly cookies: {[domain in Domain]: string} = new Proxy(this.pskey, {
		get: (obj: any, domain: string) => {
			const cookie = `uin=o${this.uin}; skey=${this.sig.skey};`
			if (!obj[domain])
				return cookie
			return `${cookie} p_uin=o${this.uin}; p_skey=${obj[domain]};`
		},
		set: () => {
			return false
		}
	})
	/** 数据统计 */
	get stat() {
		this.statistics.msg_cnt_per_min = this._calcMsgCntPerMin()
		return this.statistics
	}

	/** 修改日志级别 */
	set log_level(level: LogLevel) {
		(this.logger as log4js.Logger).level = level
		this.config.log_level = level
	}

	//@ts-ignore ts2376??
	constructor(uin: number, conf?: Config) {

		const config = {
			log_level: "info" as LogLevel,
			platform: Platform.Android,
			auto_server: true,
			ignore_self: true,
			resend: true,
			cache_group_member: true,
			reconn_interval: 5,
			data_dir: path.join(require?.main?.path || process.cwd(), "data"),
			...conf,
		}

		const dir = createDataDir(config.data_dir, uin)
		const file = path.join(dir, `device-${uin}.json`)
		try {
			var device = require(file) as ShortDevice
			var _ = false
		} catch {
			var device = generateShortDevice(uin)
			var _ = true
			fs.writeFile(file, JSON.stringify(device, null, 2), NOOP)
		}

		super(uin, config.platform, device)

		this.logger = log4js.getLogger(`[${this.apk.display}:${uin}]`)
		;(this.logger as log4js.Logger).level = config.log_level
		if (_)
			this.logger.mark("创建了新的设备文件：" + file)
		this.logger.mark("----------")
		this.logger.mark(`Package Version: oicq@${pkg.version} (Released on ${pkg.upday})`)
		this.logger.mark("View Changelogs：https://github.com/takayama-lily/oicq/releases")
		this.logger.mark("----------")

		this.dir = dir
		this.config = config as Required<Config>
		bindInternalListeners.call(this)
		this.on("internal.verbose", (verbose, level) => {
			const list: Exclude<LogLevel, "off">[] = ["fatal", "mark", "error", "warn", "info", "trace"]
			this.logger[list[level]](verbose)
		})
		lock(this, "dir")
		lock(this, "config")
		lock(this, "_cache")
		lock(this, "internal")
		lock(this, "pickUser")
		lock(this, "pickFriend")
		lock(this, "pickGroup")
		lock(this, "pickDiscuss")
		lock(this, "pickMember")
		lock(this, "cookies")
		lock(this, "fl")
		lock(this, "gl")
		lock(this, "sl")
		lock(this, "gml")
		lock(this, "blacklist")
		hide(this, "_sync_cookie")

		let n = 0
		this.heartbeat = () => {
			this._calcMsgCntPerMin()
			n++
			if (n > 10) {
				n = 0
				this.setOnlineStatus()
			}
		}

		if (!this.config.auto_server)
			this.setRemoteServer("msfwifi.3g.qq.com", 8080)
	}

	/**
	 * 会优先尝试使用token登录 (token在上次登录成功后存放在`this.dir`下)
	 *
	 * 无token或token失效时：
	 * * 传了`password`则尝试密码登录
	 * * 不传`password`则尝试扫码登录
	 *
	 * 掉线重连时也是自动调用此函数，走相同逻辑
	 * 你也可以在配置中修改`reconn_interval`，关闭掉线重连并自行处理
	 *
	 * @param password 可以为密码原文，或密码的md5值
	 */
	async login(password?: string | Buffer) {
		if (password && password.length > 0) {
			let md5pass
			if (typeof password === "string")
				md5pass = Buffer.from(password, "hex")
			else
				md5pass = password
			if (md5pass.length !== 16)
				md5pass = md5(String(password))
			this.password_md5 = md5pass
		}
		try {
			const token = await fs.promises.readFile(path.join(this.dir, "token"))
			return this.tokenLogin(token)
		} catch {
			if (this.password_md5)
				return this.passwordLogin(this.password_md5)
			else
				return this.sig.qrsig.length ? this.qrcodeLogin() : this.fetchQrcode()
		}
	}

	/** 设置在线状态 */
	setOnlineStatus(status = this.status || OnlineStatus.Online) {
		return setStatus.call(this, status)
	}
	/** 设置昵称 */
	async setNickname(nickname: string) {
		return this._setProfile(0x14E22, Buffer.from(String(nickname)))
	}
	/** 设置性别(1男2女) */
	async setGender(gender: 0 | 1 | 2) {
		return this._setProfile(0x14E29, Buffer.from([gender]))
	}
	/** 设置生日(20201202) */
	async setBirthday(birthday: string | number) {
		const birth = String(birthday).replace(/[^\d]/g, "")
		const buf = Buffer.allocUnsafe(4)
		buf.writeUInt16BE(Number(birth.substr(0, 4)))
		buf[2] = Number(birth.substr(4, 2))
		buf[3] = Number(birth.substr(6, 2))
		return this._setProfile(0x16593, buf)
	}
	/** 设置个人说明 */
	async setDescription(description = "") {
		return this._setProfile(0x14E33, Buffer.from(String(description)))
	}
	/** 设置个性签名 */
	async setSignature(signature = "") {
		return setSign.call(this, signature)
	}
	/** 设置头像 */
	async setAvatar(file: ImageElem["file"]) {
		return setAvatar.call(this, new Image({ type: "image", file }))
	}
	/** 获取漫游表情 */
	getRoamingStamp(no_cache = false) {
		return getStamp.call(this, no_cache)
	}
	/** 删除表情(支持批量) */
	deleteStamp(id: string | string[]) {
		return delStamp.call(this, id)
	}
	/** 获取系统消息 */
	getSystemMsg() {
		return getSysMsg.call(this)
	}
	/** 添加好友分组 */
	addClass(name: string) {
		return addClass.call(this, name)
	}
	/** 删除好友分组 */
	deleteClass(id: number) {
		return delClass.call(this, id)
	}
	/** 重命名好友分组 */
	renameClass(id: number, name: string) {
		return renameClass.call(this, id, name)
	}
	/** 重载好友列表 */
	reloadFriendList() {
		return loadFL.call(this)
	}
	/** 重载陌生人列表 */
	reloadStrangerList() {
		return loadSL.call(this)
	}
	/** 重载群列表 */
	reloadGroupList() {
		return loadGL.call(this)
	}
	/** 重载黑名单 */
	reloadBlackList() {
		return loadBL.call(this)
	}
	/** 清空缓存文件 fs.rm need v14.14 */
	cleanCache() {
		const dir = path.join(this.dir, "../image")
		fs.rm?.(dir, { recursive: true }, () => {
			fs.mkdir(dir, NOOP)
		})
	}
	/** 获取视频下载地址 */
	getVideoUrl(fid: string, md5: string | Buffer) {
		return this.pickFriend(this.uin).getVideoUrl(fid, md5)
	}
	/** 获取转发消息 */
	getForwardMsg(resid: string) {
		return this.pickFriend(this.uin).getForwardMsg(resid)
	}
	/** 制作转发消息 */
	makeForwardMsg(fake: Forwardable[], dm = false) {
		return (dm ? this.pickFriend : this.pickGroup)(this.uin).makeForwardMsg(fake)
	}
	/** Ocr图片转文字 */
	imageOcr(file: ImageElem["file"]) {
		return imageOcr.call(this, new Image({ type: "image", file }))
	}

	/** @cqhttp (cqhttp遗留方法) use client.cookies[domain] */
	getCookies(domain: Domain = "") {
		return this.cookies[domain]
	}
	/** @cqhttp use client.bkn */
	getCsrfToken() {
		return this.bkn
	}
	/** @cqhttp use client.fl */
	getFriendList() {
		return this.fl
	}
	/** @cqhttp use client.gl */
	getGroupList() {
		return this.gl
	}
	/** @cqhttp use client.sl */
	getStrangerList() {
		return this.sl
	}
	/** @cqhttp use user.getSimpleInfo() */
	async getStrangerInfo(user_id: number) {
		return this.pickUser(user_id).getSimpleInfo()
	}
	/** @cqhttp use group.info or group.renew() */
	async getGroupInfo(group_id: number, no_cache = false) {
		const group = this.pickGroup(group_id)
		if (no_cache) return group.renew()
		return group.info || group.renew()
	}
	/** @cqhttp use group.getMemberList() */
	async getGroupMemberList(group_id: number, no_cache = false) {
		return this.pickGroup(group_id).getMemberMap(no_cache)
	}
	/** @cqhttp use member.info or member.renew() */
	async getGroupMemberInfo(group_id: number, user_id: number, no_cache = false) {
		if (no_cache || !this.gml.get(group_id)?.has(user_id))
			return this.pickMember(group_id, user_id).renew()
		return this.gml.get(group_id)?.get(user_id)!
	}
	/** @cqhttp use friend.sendMsg() */
	async sendPrivateMsg(user_id: number, message: Sendable, source?: Quotable) {
		return this.pickFriend(user_id).sendMsg(message, source)
	}
	/** @cqhttp use group.sendMsg() */
	async sendGroupMsg(group_id: number, message: Sendable, source?: Quotable) {
		return this.pickGroup(group_id).sendMsg(message, source)
	}
	/** @cqhttp use discuss.sendMsg() */
	async sendDiscussMsg(discuss_id: number, message: Sendable, source?: Quotable) {
		return this.pickDiscuss(discuss_id).sendMsg(message)
	}
	/** @cqhttp use member.sendMsg() */
	async sendTempMsg(group_id: number, user_id: number, message: Sendable) {
		return this.pickMember(group_id, user_id).sendMsg(message)
	}
	/** @cqhttp use user.recallMsg() or group.recallMsg() */
	async deleteMsg(message_id: string) {
		if (message_id.length > 24) {
			const { group_id, seq, rand, pktnum } = parseGroupMessageId(message_id)
			return this.pickGroup(group_id).recallMsg(seq, rand, pktnum)
		} else {
			const { user_id, seq, rand, time } = parseDmMessageId(message_id)
			return this.pickUser(user_id).recallMsg(seq, rand, time)
		}
	}
	/** @cqhttp use user.markRead() or group.markRead() */
	async reportReaded(message_id: string) {
		if (message_id.length > 24) {
			const { group_id, seq } = parseGroupMessageId(message_id)
			return this.pickGroup(group_id).markRead(seq)
		} else {
			const { user_id, time } = parseDmMessageId(message_id)
			return this.pickUser(user_id).markRead(time)
		}
	}
	/** @cqhttp use user.getChatHistory() or group.getChatHistory() */
	async getMsg(message_id: string) {
		return (await this.getChatHistory(message_id, 1)).pop()
	}
	/** @cqhttp use user.getChatHistory() or group.getChatHistory() */
	async getChatHistory(message_id: string, count = 20) {
		if (message_id.length > 24) {
			const { group_id, seq } = parseGroupMessageId(message_id)
			return this.pickGroup(group_id).getChatHistory(seq, count)
		} else {
			const { user_id, time } = parseDmMessageId(message_id)
			return this.pickUser(user_id).getChatHistory(time, count)
		}
	}
	/** @cqhttp use group.muteAnony() */
	async setGroupAnonymousBan(group_id: number, flag: string, duration = 1800) {
		return this.pickGroup(group_id).muteAnony(flag, duration)
	}
	/** @cqhttp use group.allowAnony() */
	async setGroupAnonymous(group_id: number, enable = true) {
		return this.pickGroup(group_id).allowAnony(enable)
	}
	/** @cqhttp use group.muteAll() */
	async setGroupWholeBan(group_id: number, enable = true) {
		return this.pickGroup(group_id).muteAll(enable)
	}
	/** @cqhttp use group.setName() */
	async setGroupName(group_id: number, name: string) {
		return this.pickGroup(group_id).setName(name)
	}
	/** @cqhttp use group.announce() */
	async sendGroupNotice(group_id: number, content: string) {
		return this.pickGroup(group_id).announce(content)
	}
	/** @cqhttp use group.setAdmin() or member.setAdmin() */
	async setGroupAdmin(group_id: number, user_id: number, enable = true) {
		return this.pickMember(group_id, user_id).setAdmin(enable)
	}
	/** @cqhttp use group.setSpecialTitle() or member.setSpecialTitle() */
	async setGroupSpecialTitle(group_id: number, user_id: number, special_title: string, duration = -1) {
		return this.pickMember(group_id, user_id).setTitle(special_title, duration)
	}
	/** @cqhttp use group.setCard() or member.setCard() */
	async setGroupCard(group_id: number, user_id: number, card: string) {
		return this.pickMember(group_id, user_id).setCard(card)
	}
	/** @cqhttp use group.kickMember() or member.kick() */
	async setGroupKick(group_id: number, user_id: number, reject_add_request = false) {
		return this.pickMember(group_id, user_id).kick(reject_add_request)
	}
	/** @cqhttp use group.muteMember() or member.mute() */
	async setGroupBan(group_id: number, user_id: number, duration = 1800) {
		return this.pickMember(group_id, user_id).mute(duration)
	}
	/** @cqhttp use group.quit() */
	async setGroupLeave(group_id: number) {
		return this.pickGroup(group_id).quit()
	}
	/** @cqhttp use group.pokeMember() or member.poke() */
	async sendGroupPoke(group_id: number, user_id: number) {
		return this.pickMember(group_id, user_id).poke()
	}
	/** @cqhttp use member.addFriend() */
	async addFriend(group_id: number, user_id: number, comment = "") {
		return this.pickMember(group_id, user_id).addFriend(comment)
	}
	/** @cqhttp use friend.delete() */
	async deleteFriend(user_id: number, block = true) {
		return this.pickFriend(user_id).delete(block)
	}
	/** @cqhttp use group.invite() */
	async inviteFriend(group_id: number, user_id: number) {
		return this.pickGroup(group_id).invite(user_id)
	}
	/** @cqhttp use friend.thumbUp() */
	async sendLike(user_id: number, times = 1) {
		return this.pickFriend(user_id).thumbUp(times)
	}
	/** @cqhttp user client.setAvatar() */
	async setPortrait(file: Parameters<Client["setAvatar"]>[0]) {
		return this.setAvatar(file)
	}
	/** @cqhttp use group.setAvatar() */
	async setGroupPortrait(group_id: number, file: Parameters<Group["setAvatar"]>[0]) {
		return this.pickGroup(group_id).setAvatar(file)
	}
	/** @cqhttp use group.fs */
	acquireGfs(group_id: number) {
		return this.pickGroup(group_id).fs
	}
	/** @cqhttp use user.setFriendReq() or user.addFriendBack() */
	async setFriendAddRequest(flag: string, approve = true, remark = "", block = false) {
		const { user_id, seq, single } = parseFriendRequestFlag(flag)
		const user = this.pickUser(user_id)
		return single ? user.addFriendBack(seq, remark) : user.setFriendReq(seq, approve, remark, block)
	}
	/** @cqhttp use user.setGroupInvite() or user.setGroupReq() */
	async setGroupAddRequest(flag: string, approve = true, reason = "", block = false) {
		const { group_id, user_id, seq, invite } = parseGroupRequestFlag(flag)
		const user = this.pickUser(user_id)
		return invite ? user.setGroupInvite(group_id, seq, approve, block) : user.setGroupReq(group_id, seq, approve, reason, block)
	}

	/** dont use it if not clear the usage */
	sendOidb(cmd: string, body: Uint8Array, timeout = 5) {
		const sp = cmd //OidbSvc.0x568_22
			.replace("OidbSvc.", "")
			.replace("oidb_", "")
			.split("_")
		const type1 = parseInt(sp[0], 16), type2 = parseInt(sp[1])
		body = pb.encode({
			1: type1,
			2: isNaN(type2) ? 1 : type2,
			3: 0,
			4: body,
			6: "android " + this.apk.ver,
		})
		return this.sendUni(cmd, body, timeout)
	}

	/** emit an event */
	em(name = "", data?: any) {
		data = Object.defineProperty(data || { }, "self_id", {
			value: this.uin,
			writable: true,
			enumerable: true,
			configurable: true,
		})
		while (true) {
			this.emit(name, data)
			let i = name.lastIndexOf(".")
			if (i === -1)
				break
			name = name.slice(0, i)
		}
	}

	protected _msgExists(from: number, type: number, seq: number, time: number) {
		if (timestamp() + this.sig.time_diff - time >= 60 || time < this.stat.start_time)
			return true
		const id = [from, type, seq].join("-")
		const set = this._cache.get(time)
		if (!set) {
			this._cache.set(time, new Set([id]))
			return false
		} else {
			if (set.has(id))
				return true
			else
				set.add(id)
			return false
		}
	}

	protected _calcMsgCntPerMin() {
		let cnt = 0
		for (let [time, set] of this._cache) {
			if (timestamp() - time >= 60)
				this._cache.delete(time)
			else
				cnt += set.size
		}
		return cnt
	}

	private async _setProfile(k: number, v: Buffer) {
		const buf = Buffer.allocUnsafe(11 + v.length)
		buf.writeUInt32BE(this.uin)
		buf.writeUInt8(0, 4)
		buf.writeInt32BE(k, 5)
		buf.writeUInt16BE(v.length, 9)
		buf.fill(v, 11)
		const payload = await this.sendOidb("OidbSvc.0x4ff_9", buf)
		const obj = pb.decode(payload)
		return obj[3] === 0 || obj[3] === 34
	}

	/** @deprecated use client.submitSlider() */
	sliderLogin(ticket: string) {
		return this.submitSlider(ticket)
	}
	/** @deprecated use client.sendSmsCode() */
	sendSMSCode() {
		return this.sendSmsCode()
	}
	/** @deprecated use client.submitSmsCode() */
	submitSMSCode(code: string) {
		return this.submitSmsCode(code)
	}
	/** @deprecated use client.status */
	get online_status() {
		return this.status
	}
}

/** 日志记录器接口 */
export interface Logger {
	trace(msg: any, ...args: any[]): any
	debug(msg: any, ...args: any[]): any
	info(msg: any, ...args: any[]): any
	warn(msg: any, ...args: any[]): any
	error(msg: any, ...args: any[]): any
	fatal(msg: any, ...args: any[]): any
	mark(msg: any, ...args: any[]): any
}

/** 日志等级 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark" | "off"

/** 配置项 */
export interface Config {
	/** 日志等级，默认info (打印日志会降低性能，若消息量巨大建议修改此参数) */
	log_level?: LogLevel
	/** 1:安卓手机(默认) 2:aPad 3:安卓手表 4:MacOS 5:iPad */
	platform?: Platform
	/** 群聊和频道中过滤自己的消息(默认true) */
	ignore_self?: boolean
	/** 被风控时是否尝试用分片发送，默认true */
	resend?: boolean
	/** 数据存储文件夹，需要可写权限，默认主模块下的data文件夹 */
	data_dir?: string
	/**
	 * 触发system.offline.network事件后的重新登录间隔秒数，默认5(秒)，不建议设置过低
	 * 设置为0则不会自动重连，然后你可以监听此事件自己处理
	 */
	reconn_interval?: number
	/** 是否缓存群员列表(默认true)，群多的时候(500~1000)会多占据约100MB+内存，关闭后进程只需不到20MB内存 */
	cache_group_member?: boolean
	/** 自动选择最优服务器(默认true)，关闭后会一直使用`msfwifi.3g.qq.com:8080`进行连接 */
	auto_server?: boolean
	/** ffmpeg */
	ffmpeg_path?: string
	ffprobe_path?: string
}

/** 数据统计 */
export type Statistics = Client["stat"]

function createDataDir(dir: string, uin: number) {
	if (!fs.existsSync(dir))
		fs.mkdirSync(dir, { mode: 0o755, recursive: true })
	const img_path = path.join(dir, "image")
	const uin_path = path.join(dir, String(uin))
	if (!fs.existsSync(img_path))
		fs.mkdirSync(img_path)
	if (!fs.existsSync(uin_path))
		fs.mkdirSync(uin_path, { mode: 0o755 })
	return uin_path
}

/** 创建一个客户端 (=new Client) */
export function createClient(uin: number, config?: Config) {
	if (isNaN(Number(uin)))
		throw new Error(uin + " is not an OICQ account")
	return new Client(Number(uin), config)
}
