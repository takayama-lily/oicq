import * as fs from "fs"
import * as path from "path"
import * as log4js from "log4js"
import { BaseClient, Platform, pb, generateShortDevice, ShortDevice, Domain } from "./core"
const pkg = require("../package.json")
import { md5, timestamp, NOOP, hide, Gender, OnlineStatus } from "./common"
import { bindInternalListeners, parseFriendRequestFlag, parseGroupRequestFlag, getSystemMessage, Internal } from "./internal"
import { EventMap } from "./events"
import { Contact, Friend } from "./friend"
import { Discuss, Group } from "./group"
import { Member } from "./member"
import { Forwardable, Sendable, parseDmMessageId, parseGroupMessageId } from "./message"

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
	/** 被风控时是否尝试用分片发送，默认true */
	resend?: boolean
	/** 数据存储文件夹，需要可写权限，默认主模块下的data文件夹 */
	data_dir?: string
	/**
	 * 触发system.offline.network事件后的重新登录间隔秒数，默认5(秒)，不建议设置低于3(秒)
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

/** 一个客户端 */
export interface Client extends BaseClient {
	on<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	on<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: this, ...args: any[]) => void): this
	once<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	once<S extends string | symbol>(event: S & Exclude<S, keyof EventMap>, listener: (this: this, ...args: any[]) => void): this
	prependListener<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	prependListener(event: string | symbol, listener: (this: this, ...args: any[]) => void): this
	prependOnceListener<T extends keyof EventMap>(event: T, listener: EventMap<this>[T]): this
	prependOnceListener(event: string | symbol, listener: (this: this, ...args: any[]) => void): this
}

/** 一个客户端 */
export class Client extends BaseClient {

	/** 得到一个群对象 */
	readonly asGroup = Group.as.bind(this)
	/** 得到一个好友对象 */
	readonly asFriend = Friend.as.bind(this)
	/** 得到一个群员对象 */
	readonly asMember = Member.as.bind(this)
	/** 得到一个联系人对象 */
	readonly asUser = Contact.as.bind(this)
	/** 得到一个讨论组对象 */
	readonly asDiscuss = Discuss.as.bind(this)
	readonly internal = new Internal(this)

	/** 日志记录器 */
	logger: Logger | log4js.Logger
	/** 账号存储目录 */
	readonly dir: string
	/** 配置(支持热修改) */
	readonly config: Required<Config>

	protected readonly _cache = new Map<number, Set<string>>()
	protected _sync_cookie?: Uint8Array

	get [Symbol.toStringTag]() {
		return "OicqClient"
	}
	/** 好友分组 */
	get class() {
		return this.internal.class
	}
	/** 好友列表 */
	get fl() {
		return this.internal.fl
	}
	/** 群列表 */
	get gl() {
		return this.internal.gl
	}
	/** 陌生人列表 */
	get sl() {
		return this.internal.sl
	}
	/** 群员缓存列表 */
	get gml() {
		return this.internal.gml
	}
	/** 黑名单列表 */
	get blacklist() {
		return this.internal.blacklist
	}
	/** 在线状态 */
	get status() {
		return this.internal.status
	}
	/** 昵称 */
	get nickname() {
		return this.internal.nickname
	}
	/** 性别 */
	get sex() {
		return this.internal.sex
	}
	/** 年龄 */
	get age() {
		return this.internal.age
	}
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

	//@ts-ignore ts2376??
	constructor(uin: number, conf?: Config) {

		const config = {
			log_level: "trace" as LogLevel,
			platform: Platform.Android,
			auto_server: true,
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
		hide(this, "dir")
		hide(this, "config")
		hide(this, "_cache")
		hide(this, "internal")
		hide(this, "asUser")
		hide(this, "asFriend")
		hide(this, "asGroup")
		hide(this, "asDiscuss")
		hide(this, "asMember")
		hide(this, "cookies")

		let n = 0
		this.heartbeat = () => {
			this._calcMsgCntPerMin()
			n++
			if (n > 10) {
				n = 0
				this.internal.setStatus()
			}
		}
	}

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

	em(name = "", data?: any) {
		while (true) {
			this.emit(name, data)
			let i = name.lastIndexOf(".")
			if (i === -1)
				break
			name = name.slice(0, i)
		}
	}

	protected _msgExists(from: number, type: number, seq: number, time: number) {
		if (timestamp() - time >= 60 || time < this.stat.start_time)
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
			this.md5pass = md5pass
		}
		try {
			const token = await fs.promises.readFile(path.join(this.dir, "token"))
			this.tokenLogin(token)
		} catch {
			if (this.md5pass)
				this.passwordLogin(this.md5pass)
			else
				this.sig.qrsig.length ? this.qrcodeLogin() : this.fetchQrcode()
		}
	}

	////// 以下方法标记为废弃

	/** @deprecated use submitSlider */
	sliderLogin(ticket: string) {
		return this.submitSlider(ticket)
	}
	/** @deprecated use client.cookies[domain] */
	getCookies(domain: Domain = "") {
		return this.cookies[domain]
	}
	/** @deprecated use client.bkn */
	getCsrfToken() {
		return this.bkn
	}
	/** @deprecated use client.fl */
	getFriendList() {
		return this.fl
	}
	/** @deprecated use client.gl */
	getGroupList() {
		return this.gl
	}
	/** @deprecated use client.sl */
	getStrangerList() {
		return this.sl
	}
	/** @deprecated use user.getSimpleInfo() */
	async getStrangerInfo(user_id: number) {
		return this.asUser(user_id).getSimpleInfo()
	}
	/** @deprecated use group.info or group.fetchInfo() */
	async getGroupInfo(group_id: number, no_cache = false) {
		const group = this.asGroup(group_id)
		if (no_cache) return group.fetchInfo()
		return group.info || group.fetchInfo()
	}
	/** @deprecated use group.getMemberList() */
	async getGroupMemberList(group_id: number, no_cache = false) {
		return this.asGroup(group_id).getMemberList(no_cache)
	}
	/** @deprecated use member.info or member.fetchInfo() */
	async getGroupMemberInfo(group_id: number, user_id: number, no_cache = false) {
		if (no_cache || !this.gml.get(group_id)?.has(user_id))
			return this.asMember(group_id, user_id).fetchInfo()
		return this.gml.get(group_id)?.get(user_id)!
	}
	/** @deprecated use friend.sendMessage() */
	async sendPrivateMsg(user_id: number, message: Sendable) {
		return this.asFriend(user_id).sendMessage(message)
	}
	/** @deprecated use group.sendMessage() */
	async sendGroupMsg(group_id: number, message: Sendable, anonymous = false) {
		return this.asGroup(group_id).sendMessage(message, anonymous)
	}
	/** @deprecated use discuss.sendMessage() */
	async sendDiscussMsg(discuss_id: number, message: Sendable) {
		return this.asDiscuss(discuss_id).sendMessage(message)
	}
	/** @deprecated use member.sendMessage() */
	async sendTempMsg(group_id: number, user_id: number, message: Sendable) {
		return this.asMember(group_id, user_id).sendMessage(message)
	}
	/** @deprecated use user.recallMessage() or group.recallMessage() */
	async deleteMsg(message_id: string) {
		if (message_id.length > 24) {
			const { group_id, seq, rand, pktnum } = parseGroupMessageId(message_id)
			return this.asGroup(group_id).recallMessage(seq, rand, pktnum)
		} else {
			const { user_id, seq, rand, time } = parseDmMessageId(message_id)
			return this.asUser(user_id).recallMessage(seq, rand, time)
		}
	}
	/** @deprecated use user.markRead() or group.markRead() */
	async reportReaded(message_id: string) {
		if (message_id.length > 24) {
			const { group_id, seq } = parseGroupMessageId(message_id)
			return this.asGroup(group_id).markRead(seq)
		} else {
			const { user_id, time } = parseDmMessageId(message_id)
			return this.asUser(user_id).markRead(time)
		}
	}
	/** @deprecated use user.getChatHistory() or group.getChatHistory() */
	async getMsg(message_id: string) {
		return this.getChatHistory(message_id, 1)
	}
	/** @deprecated use user.getChatHistory() or group.getChatHistory() */
	async getChatHistory(message_id: string, count = 20) {
		if (message_id.length > 24) {
			const { group_id, seq } = parseGroupMessageId(message_id)
			return this.asGroup(group_id).getChatHistory(seq, count)
		} else {
			const { user_id, time } = parseDmMessageId(message_id)
			return this.asUser(user_id).getChatHistory(time, count)
		}
	}
	/** @deprecated use group.muteAnonymous() */
	async setGroupAnonymousBan(group_id: number, flag: string, duration = 1800) {
		return this.asGroup(group_id).muteAnonymous(flag, duration)
	}
	/** @deprecated use group.allowAnonymous() */
	async setGroupAnonymous(group_id: number, enable = true) {
		return this.asGroup(group_id).allowAnonymous(enable)
	}
	/** @deprecated use group.muteAll() */
	async setGroupWholeBan(group_id: number, enable = true) {
		return this.asGroup(group_id).muteAll(enable)
	}
	/** @deprecated use group.setName() */
	async setGroupName(group_id: number, name: string) {
		return this.asGroup(group_id).setName(name)
	}
	/** @deprecated use group.announce() */
	async sendGroupNotice(group_id: number, content: string) {
		return this.asGroup(group_id).announce(content)
	}
	/** @deprecated use group.setAdmin() or member.setAdmin() */
	async setGroupAdmin(group_id: number, user_id: number, enable = true) {
		return this.asMember(group_id, user_id).setAdmin(enable)
	}
	/** @deprecated use group.setSpecialTitle() or member.setSpecialTitle() */
	async setGroupSpecialTitle(group_id: number, user_id: number, special_title: string, duration = -1) {
		return this.asMember(group_id, user_id).setSpecialTitle(special_title, duration)
	}
	/** @deprecated use group.setCard() or member.setCard() */
	async setGroupCard(group_id: number, user_id: number, card: string) {
		return this.asMember(group_id, user_id).setCard(card)
	}
	/** @deprecated use group.kickMember() or member.kick() */
	async setGroupKick(group_id: number, user_id: number, reject_add_request = false) {
		return this.asMember(group_id, user_id).kick(reject_add_request)
	}
	/** @deprecated use group.muteMember() or member.mute() */
	async setGroupBan(group_id: number, user_id: number, duration = 1800) {
		return this.asMember(group_id, user_id).mute(duration)
	}
	/** @deprecated use group.quit() */
	async setGroupLeave(group_id: number) {
		return this.asGroup(group_id).quit()
	}
	/** @deprecated use group.pokeMember() or member.poke() */
	async sendGroupPoke(group_id: number, user_id: number) {
		return this.asMember(group_id, user_id).poke()
	}
	/** @deprecated use member.addFriend() */
	async addFriend(group_id: number, user_id: number, comment = "") {
		return this.asMember(group_id, user_id).addFriend(comment)
	}
	/** @deprecated use friend.delete() */
	async deleteFriend(user_id: number, block = true) {
		return this.asFriend(user_id).delete(block)
	}
	/** @deprecated use group.invite() */
	async inviteFriend(group_id: number, user_id: number) {
		return this.asGroup(group_id).invite(user_id)
	}
	/** @deprecated use friend.thumbUp() */
	async sendLike(user_id: number, times = 1) {
		return this.asFriend(user_id).thumbUp(times)
	}
	/** @deprecated use group.setPortrait() */
	async setGroupPortrait(group_id: number, file: Parameters<Group["setAvatar"]>[0]) {
		return this.asGroup(group_id).setAvatar(file)
	}
	/** @deprecated use group.fs */
	acquireGfs(group_id: number) {
		return this.asGroup(group_id).fs
	}
	/** @deprecated use user.approveFriendRequest() or user.addFriendBack() */
	async setFriendAddRequest(flag: string, approve = true, remark = "", block = false) {
		const { user_id, seq, single } = parseFriendRequestFlag(flag)
		const user = this.asUser(user_id)
		return single ? user.addFriendBack(seq, remark) : user.approveFriendRequest(seq, approve, remark, block)
	}
	/** @deprecated use user.approveGroupRequest() or user.approveGroupInvitation() */
	async setGroupAddRequest(flag: string, approve = true, reason = "", block = false) {
		const { group_id, user_id, seq, invite } = parseGroupRequestFlag(flag)
		const user = this.asUser(user_id)
		return invite ? user.approveGroupInvitation(group_id, seq, approve, block) : user.approveGroupRequest(group_id, seq, approve, reason, block)
	}

	////// 以上方法标记为废弃

	/** 设置在线状态 */
	async setOnlineStatus(status: OnlineStatus) {
		return this.internal.setStatus(status)
	}
	/** 获取系统消息 */
	async getSystemMsg() {
		return getSystemMessage.call(this)
	}
	/** 获取转发消息 */
	async getForwardMsg(resid: string) {
		return this.internal.getForwardMessage(resid)
	}
	/** @deprecated 制作转发消息 (use friend.makeForwardMessage or group.makeForwardMessage) */
	async makeForwardMsg(fake: Forwardable[], dm = false) {
		return (dm ? this.asFriend : this.asGroup)(this.uin).makeForwardMessage(fake)
	}
	/** 设置昵称 */
	async setNickname(nickname: string) {
		return this.internal.setNickname(nickname)
	}
	/** 设置性别 */
	async setGender(gender: Gender) {
		return this.internal.setGender(gender)
	}
	/** 设置生日(20201202) */
	async setBirthday(birthday: string | number) {
		const birth = String(birthday).replace(/[^\d]/g, "")
		return this.internal.setBirthday(Number(birth.substr(0, 4)), Number(birth.substr(4, 2)), Number(birth.substr(6, 2)))
	}
	/** 设置个性签名 */
	async setSignature(signature = "") {
		return this.internal.setSignature(signature)
	}
	/** 设置个人说明 */
	async setDescription(description = "") {
		return this.internal.setDescription(description)
	}
	/** 设置头像 */
	async setPortrait(file: Parameters<Internal["setAvatar"]>[0]) {
		return this.internal.setAvatar(file)
	}
	/** 获取漫游表情 */
	async getRoamingStamp(no_cache = false) {
		return this.internal.getRoamingStamp(no_cache)
	}
	/** 获取离线文件下载链接 */
	async fetchOfflineFileDownloadUrl(fid: string) {
		return this.internal.fetchOfflineFileDownloadUrl(fid)
	}
	/** 获取视频下载链接 */
	async fetchVideoDownloadUrl(fid: string, md5: string | Buffer) {
		return this.internal.fetchVideoDownloadUrl(fid, md5)
	}

	/** 清空缓存目录 fs.rm need v14.14 */
	cleanCache(type?: "image" | "record") {
		switch (type) {
		case "image":
		case "record":
			const dir = path.join(this.dir, "..", type)
			fs.rm?.(dir, { recursive: true }, () => {
				fs.mkdir(dir, NOOP)
			})
			break
		default:
			this.cleanCache("image")
			this.cleanCache("record")
			break
		}
	}
}

/** 数据统计 */
export type Statistics = Client["stat"]

function createDataDir(dir: string, uin: number) {
	if (!fs.existsSync(dir))
		fs.mkdirSync(dir, { mode: 0o755, recursive: true })
	const img_path = path.join(dir, "image")
	const ptt_path = path.join(dir, "record")
	const uin_path = path.join(dir, String(uin))
	if (!fs.existsSync(img_path))
		fs.mkdirSync(img_path)
	if (!fs.existsSync(ptt_path))
		fs.mkdirSync(ptt_path)
	if (!fs.existsSync(uin_path))
		fs.mkdirSync(uin_path, { mode: 0o755 })
	return uin_path
}

/** 创建一个客户端 */
export function createClient(uin: number, config?: Config) {
	if (isNaN(Number(uin)))
		throw new Error(uin + " is not an OICQ account")
	return new Client(Number(uin), config)
}
