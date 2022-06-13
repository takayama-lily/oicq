import { EventEmitter } from "events"
import { randomBytes } from "crypto"
import { Readable } from "stream"
import Network from "./network"
import Ecdh from "./ecdh"
import Writer from "./writer"
import * as tlv from "./tlv"
import * as tea from "./tea"
import * as pb from "./protobuf"
import * as jce from "./jce"
import { BUF0, BUF4, BUF16, NOOP, md5, timestamp, lock, hide, unzip, int32ip2str } from "./constants"
import { ShortDevice, Device, generateFullDevice, Platform, Apk, getApkInfo } from "./device"

const FN_NEXT_SEQ = Symbol("FN_NEXT_SEQ")
const FN_SEND = Symbol("FN_SEND")
const FN_SEND_LOGIN = Symbol("FN_SEND_LOGIN")
const HANDLERS = Symbol("HANDLERS")
const NET = Symbol("NET")
const ECDH = Symbol("ECDH")
const IS_ONLINE = Symbol("IS_ONLINE")
const LOGIN_LOCK = Symbol("LOGIN_LOCK")
const HEARTBEAT = Symbol("HEARTBEAT")

export enum VerboseLevel {
	Fatal, Mark, Error, Warn, Info, Debug
}

export class ApiRejection {
	constructor(public code: number, public message = "unknown") {
		this.code = Number(this.code)
		this.message = this.message?.toString() || "unknown"
	}
}

export enum QrcodeResult {
	OtherError = 0,
	Timeout = 0x11,
	WaitingForScan = 0x30,
	WaitingForConfirm = 0x35,
	Canceled = 0x36,
}

export interface BaseClient {
	/** 收到二维码 */
	on(name: "internal.qrcode", listener: (this: this, qrcode: Buffer) => void): this
	/** 收到滑动验证码 */
	on(name: "internal.slider", listener: (this: this, url: string) => void): this
	/** 登录保护验证 */
	on(name: "internal.verify", listener: (this: this, url: string, phone: string) => void): this
	/** token过期(此时已掉线) */
	on(name: "internal.error.token", listener: (this: this) => void): this
	/** 网络错误 */
	on(name: "internal.error.network", listener: (this: this, code: number, message: string) => void): this
	/** 密码登录相关错误 */
	on(name: "internal.error.login", listener: (this: this, code: number, message: string) => void): this
	/** 扫码登录相关错误 */
	on(name: "internal.error.qrcode", listener: (this: this, code: QrcodeResult, message: string) => void): this
	/** 登录成功 */
	on(name: "internal.online", listener: (this: this, token: Buffer, nickname: string, gender: number, age: number) => void): this
	/** token更新 */
	on(name: "internal.token", listener: (this: this, token: Buffer) => void): this
	/** 服务器强制下线 */
	on(name: "internal.kickoff", listener: (this: this, reason: string) => void): this
	/** 业务包 */
	on(name: "internal.sso", listener: (this: this, cmd: string, payload: Buffer, seq: number) => void): this
	/** 日志信息 */
	on(name: "internal.verbose", listener: (this: this, verbose: unknown, level: VerboseLevel) => void): this
	on(name: string | symbol, listener: (this: this, ...args: any[]) => void): this
}

export class BaseClient extends EventEmitter {

	private [IS_ONLINE] = false
	private [LOGIN_LOCK] = false
	private [ECDH] = new Ecdh
	private readonly [NET] = new Network
	// 回包的回调函数
	private readonly [HANDLERS] = new Map<number, (buf: Buffer) => void>()

	readonly apk: Apk
	readonly device: Device
	readonly sig = {
		seq: randomBytes(4).readUInt32BE() & 0xfff,
		session: randomBytes(4),
		randkey: randomBytes(16),
		tgtgt: randomBytes(16),
		tgt: BUF0,
		skey: BUF0,
		d2: BUF0,
		d2key: BUF0,
		t104: BUF0,
		t174: BUF0,
		qrsig: BUF0,
		/** 大数据上传通道 */
		bigdata: {
			ip: "",
			port: 0,
			sig_session: BUF0,
			session_key: BUF0,
		},
		/** 心跳包 */
		hb480: (() => {
			const buf = Buffer.alloc(9)
			buf.writeUInt32BE(this.uin)
			buf.writeInt32BE(0x19e39, 5)
			return pb.encode({
				1: 1152,
				2: 9,
				4: buf
			})
		})(),
		/** 上次cookie刷新时间 */
		emp_time: 0,
		time_diff: 0,
	}
	readonly pskey: {[domain: string]: Buffer} = { }
	/** 心跳间隔(秒) */
	protected interval = 30
	/** 随心跳一起触发的函数，可以随意设定 */
	protected heartbeat = NOOP
	// 心跳定时器
	private [HEARTBEAT]: NodeJS.Timeout
	/** 数据统计 */
	protected readonly statistics = {
		start_time: timestamp(),
		lost_times: 0,
		recv_pkt_cnt: 0,
		sent_pkt_cnt: 0,
		lost_pkt_cnt: 0,
		recv_msg_cnt: 0,
		sent_msg_cnt: 0,
		msg_cnt_per_min: 0,
		remote_ip: "",
		remote_port: 0,
	}

	constructor(public readonly uin: number, p: Platform = Platform.Android, d?: ShortDevice) {
		super()
		this.apk = getApkInfo(p)
		this.device = generateFullDevice(d || uin)
		this[NET].on("error", err => this.emit("internal.verbose", err.message, VerboseLevel.Error))
		this[NET].on("close", () => {
			this.statistics.remote_ip = ""
			this.statistics.remote_port = 0
			this[NET].remoteAddress && this.emit("internal.verbose", `${this[NET].remoteAddress}:${this[NET].remotePort} closed`, VerboseLevel.Mark)
		})
		this[NET].on("connect2", () => {
			this.statistics.remote_ip = this[NET].remoteAddress as string
			this.statistics.remote_port = this[NET].remotePort as number
			this.emit("internal.verbose", `${this[NET].remoteAddress}:${this[NET].remotePort} connected`, VerboseLevel.Mark)
			syncTimeDiff.call(this)
		})
		this[NET].on("packet", packetListener.bind(this))
		this[NET].on("lost", lostListener.bind(this))
		this.on("internal.online", onlineListener)
		this.on("internal.sso", ssoListener)
		lock(this, "uin")
		lock(this, "apk")
		lock(this, "device")
		lock(this, "sig")
		lock(this, "pskey")
		lock(this, "statistics")
		hide(this, "heartbeat")
		hide(this, "interval")
	}

	/** 设置连接服务器，不设置则自动搜索 */
	setRemoteServer(host?: string, port?: number) {
		if (host && port) {
			this[NET].host = host
			this[NET].port = port
			this[NET].auto_search = false
		} else {
			this[NET].auto_search = true
		}
	}
	/** 是否为在线状态 (可以收发业务包的状态) */
	isOnline() {
		return this[IS_ONLINE]
	}
	/** 下线 (keepalive: 是否保持tcp连接) */
	async logout(keepalive = false) {
		await register.call(this, true)
		if (!keepalive && this[NET].connected) {
			this.terminate()
			await new Promise(resolve => this[NET].once("close", resolve))
		}
	}
	/** 直接关闭连接 */
	terminate() {
		this[IS_ONLINE] = false
		this[NET].destroy()
	}

	/** 使用上报的token登录 */
	tokenLogin(token: Buffer) {
		if (![144, 152].includes(token.length))
			throw new Error("bad token")
		this.sig.session = randomBytes(4)
		this.sig.randkey = randomBytes(16)
		this[ECDH] = new Ecdh
		this.sig.d2key = token.slice(0, 16)
		this.sig.d2 = token.slice(16, token.length - 72)
		this.sig.tgt = token.slice(token.length - 72)
		this.sig.tgtgt = md5(this.sig.d2key)
		const t = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(11)
			.writeU16(16)
			.writeBytes(t(0x100))
			.writeBytes(t(0x10a))
			.writeBytes(t(0x116))
			.writeBytes(t(0x144))
			.writeBytes(t(0x143))
			.writeBytes(t(0x142))
			.writeBytes(t(0x154))
			.writeBytes(t(0x18))
			.writeBytes(t(0x141))
			.writeBytes(t(0x8))
			.writeBytes(t(0x147))
			.writeBytes(t(0x177))
			.writeBytes(t(0x187))
			.writeBytes(t(0x188))
			.writeBytes(t(0x202))
			.writeBytes(t(0x511))
			.read()
		this[FN_SEND_LOGIN]("wtlogin.exchange_emp", body)
	}
	/** 使用密码登录 */
	passwordLogin(md5pass: Buffer) {
		this.sig.session = randomBytes(4)
		this.sig.randkey = randomBytes(16)
		this.sig.tgtgt = randomBytes(16)
		this[ECDH] = new Ecdh
		const t = tlv.getPacker(this)
		let body = new Writer()
			.writeU16(9)
			.writeU16(23)
			.writeBytes(t(0x18))
			.writeBytes(t(0x1))
			.writeBytes(t(0x106, md5pass))
			.writeBytes(t(0x116))
			.writeBytes(t(0x100))
			.writeBytes(t(0x107))
			.writeBytes(t(0x142))
			.writeBytes(t(0x144))
			.writeBytes(t(0x145))
			.writeBytes(t(0x147))
			.writeBytes(t(0x154))
			.writeBytes(t(0x141))
			.writeBytes(t(0x8))
			.writeBytes(t(0x511))
			.writeBytes(t(0x187))
			.writeBytes(t(0x188))
			.writeBytes(t(0x194))
			.writeBytes(t(0x191))
			.writeBytes(t(0x202))
			.writeBytes(t(0x177))
			.writeBytes(t(0x516))
			.writeBytes(t(0x521))
			.writeBytes(t(0x525))
			.read()
		this[FN_SEND_LOGIN]("wtlogin.login", body)
	}
	/** 提交滑动验证码 */
	submitSlider(ticket: string) {
		ticket = String(ticket).trim()
		const t = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(2)
			.writeU16(4)
			.writeBytes(t(0x193, ticket))
			.writeBytes(t(0x8))
			.writeBytes(t(0x104))
			.writeBytes(t(0x116))
			.read()
		this[FN_SEND_LOGIN]("wtlogin.login", body)
	}
	/** 发短信 */
	sendSmsCode() {
		const t = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(8)
			.writeU16(6)
			.writeBytes(t(0x8))
			.writeBytes(t(0x104))
			.writeBytes(t(0x116))
			.writeBytes(t(0x174))
			.writeBytes(t(0x17a))
			.writeBytes(t(0x197))
			.read()
		this[FN_SEND_LOGIN]("wtlogin.login", body)
	}
	/** 提交短信验证码 */
	submitSmsCode(code: string) {
		code = String(code).trim()
		if (Buffer.byteLength(code) !== 6)
			code = "123456"
		const t = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(7)
			.writeU16(7)
			.writeBytes(t(0x8))
			.writeBytes(t(0x104))
			.writeBytes(t(0x116))
			.writeBytes(t(0x174))
			.writeBytes(t(0x17c, code))
			.writeBytes(t(0x401))
			.writeBytes(t(0x198))
			.read()
		this[FN_SEND_LOGIN]("wtlogin.login", body)
	}
	/** 获取登录二维码 */
	fetchQrcode() {
		const t = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(0)
			.writeU32(16)
			.writeU64(0)
			.writeU8(8)
			.writeTlv(BUF0)
			.writeU16(6)
			.writeBytes(t(0x16))
			.writeBytes(t(0x1B))
			.writeBytes(t(0x1D))
			.writeBytes(t(0x1F))
			.writeBytes(t(0x33))
			.writeBytes(t(0x35))
			.read()
		const pkt = buildCode2dPacket.call(this, 0x31, 0x11100, body)
		this[FN_SEND](pkt).then(payload => {
			payload = tea.decrypt(payload.slice(16, -1), this[ECDH].share_key)
			const stream = Readable.from(payload, { objectMode: false })
			stream.read(54)
			const retcode = stream.read(1)[0]
			const qrsig = stream.read(stream.read(2).readUInt16BE())
			stream.read(2)
			const t = readTlv(stream)
			if (!retcode && t[0x17]) {
				this.sig.qrsig = qrsig
				this.emit("internal.qrcode", t[0x17])
			} else {
				this.emit("internal.error.qrcode", retcode, "获取二维码失败，请重试")
			}
		}).catch(() => this.emit("internal.error.network", -2, "server is busy"))
	}
	/** 扫码后调用此方法登录 */
	async qrcodeLogin() {
		const { retcode, uin, t106, t16a, t318, tgtgt } = await this.queryQrcodeResult()
		if (retcode < 0) {
			this.emit("internal.error.network", -2, "server is busy")
		} else if (retcode === 0 && t106 && t16a && t318 && tgtgt) {
			this.sig.qrsig = BUF0
			if (uin !== this.uin) {
				this.emit("internal.error.qrcode", retcode, `扫码账号(${uin})与登录账号(${this.uin})不符`)
				return
			}
			this.sig.tgtgt = tgtgt
			const t = tlv.getPacker(this)
			const body = new Writer()
				.writeU16(9)
				.writeU16(24)
				.writeBytes(t(0x18))
				.writeBytes(t(0x1))
				.writeU16(0x106)
				.writeTlv(t106)
				.writeBytes(t(0x116))
				.writeBytes(t(0x100))
				.writeBytes(t(0x107))
				.writeBytes(t(0x142))
				.writeBytes(t(0x144))
				.writeBytes(t(0x145))
				.writeBytes(t(0x147))
				.writeU16(0x16a)
				.writeTlv(t16a)
				.writeBytes(t(0x154))
				.writeBytes(t(0x141))
				.writeBytes(t(0x8))
				.writeBytes(t(0x511))
				.writeBytes(t(0x187))
				.writeBytes(t(0x188))
				.writeBytes(t(0x194))
				.writeBytes(t(0x191))
				.writeBytes(t(0x202))
				.writeBytes(t(0x177))
				.writeBytes(t(0x516))
				.writeBytes(t(0x521))
				.writeU16(0x318)
				.writeTlv(t318)
				.read()
			this[FN_SEND_LOGIN]("wtlogin.login", body)
		} else {
			let message
			switch (retcode) {
			case QrcodeResult.Timeout:
				message = "二维码超时，请重新获取"
				break
			case QrcodeResult.WaitingForScan:
				message = "二维码尚未扫描"
				break
			case QrcodeResult.WaitingForConfirm:
				message = "二维码尚未确认"
				break
			case QrcodeResult.Canceled:
				message = "二维码被取消，请重新获取"
				break
			default:
				message = "扫码遇到未知错误，请重新获取"
				break
			}
			this.sig.qrsig = BUF0
			this.emit("internal.error.qrcode", retcode, message)
		}
	}
	/** 获取扫码结果(可定时查询，retcode为0则调用qrcodeLogin登录) */
	async queryQrcodeResult() {
		let retcode = -1, uin, t106, t16a, t318, tgtgt
		if (!this.sig.qrsig.length)
			return { retcode, uin, t106, t16a, t318, tgtgt }
		const body = new Writer()
			.writeU16(5)
			.writeU8(1)
			.writeU32(8)
			.writeU32(16)
			.writeTlv(this.sig.qrsig)
			.writeU64(0)
			.writeU8(8)
			.writeTlv(BUF0)
			.writeU16(0)
			.read()
		const pkt = buildCode2dPacket.call(this, 0x12, 0x6200, body)
		try {
			let payload = await this[FN_SEND](pkt)
			payload = tea.decrypt(payload.slice(16, -1), this[ECDH].share_key)
			const stream = Readable.from(payload, { objectMode: false })
			stream.read(48)
			let len = stream.read(2).readUInt16BE()
			if (len > 0) {
				len--
				if (stream.read(1)[0] === 2) {
					stream.read(8)
					len -= 8
				}
				if (len > 0)
					stream.read(len)
			}
			stream.read(4)
			retcode = stream.read(1)[0]
			if (retcode === 0) {
				stream.read(4)
				uin = stream.read(4).readUInt32BE() as number
				stream.read(6)
				const t = readTlv(stream)
				t106 = t[0x18]
				t16a = t[0x19]
				t318 = t[0x65]
				tgtgt = t[0x1e]
			}
		} catch { }
		return { retcode, uin, t106, t16a, t318, tgtgt }
	}

	private [FN_NEXT_SEQ]() {
		if (++this.sig.seq >= 0x8000)
			this.sig.seq = 1
		return this.sig.seq
	}
	private [FN_SEND](pkt: Uint8Array, timeout = 5) {
		this.statistics.sent_pkt_cnt++
		const seq = this.sig.seq
		return new Promise((resolve: (payload: Buffer) => void, reject) => {
			const id = setTimeout(() => {
				this[HANDLERS].delete(seq)
				this.statistics.lost_pkt_cnt++
				reject(new ApiRejection(-2, `packet timeout (${seq})`))
			}, timeout * 1000)
			this[NET].join(() => {
				this[NET].write(pkt, () => {
					this[HANDLERS].set(seq, (payload) => {
						clearTimeout(id)
						this[HANDLERS].delete(seq)
						resolve(payload)
					})
				})
			})
		})
	}
	private async [FN_SEND_LOGIN](cmd: LoginCmd, body: Buffer) {
		if (this[IS_ONLINE] || this[LOGIN_LOCK])
			return
		const pkt = buildLoginPacket.call(this, cmd, body)
		try {
			this[LOGIN_LOCK] = true
			decodeLoginResponse.call(this, await this[FN_SEND](pkt))
		} catch (e: any) {
			this[LOGIN_LOCK] = false
			this.emit("internal.error.network", -2, "server is busy")
			this.emit("internal.verbose", e.message, VerboseLevel.Error)
		}
	}
	/** 发送一个业务包不等待返回 */
	writeUni(cmd: string, body: Uint8Array, seq = 0) {
		this.statistics.sent_pkt_cnt++
		this[NET].write(buildUniPkt.call(this, cmd, body, seq))
	}
	/** 发送一个业务包并等待返回 */
	async sendUni(cmd: string, body: Uint8Array, timeout = 5) {
		if (!this[IS_ONLINE])
			throw new ApiRejection(-1, `client not online`)
		return this[FN_SEND](buildUniPkt.call(this, cmd, body), timeout)
	}
}

function buildUniPkt(this: BaseClient, cmd: string, body: Uint8Array, seq = 0) {
	seq = seq || this[FN_NEXT_SEQ]()
	this.emit("internal.verbose", `send:${cmd} seq:${seq}`, VerboseLevel.Debug)
	let len = cmd.length + 20
	const sso = Buffer.allocUnsafe(len + body.length + 4)
	sso.writeUInt32BE(len, 0)
	sso.writeUInt32BE(cmd.length + 4, 4)
	sso.fill(cmd, 8)
	let offset = cmd.length + 8
	sso.writeUInt32BE(8, offset)
	sso.fill(this.sig.session, offset + 4)
	sso.writeUInt32BE(4, offset + 8)
	sso.writeUInt32BE(body.length + 4, offset + 12)
	sso.fill(body, offset + 16)
	const encrypted = tea.encrypt(sso, this.sig.d2key)
	const uin = String(this.uin)
	len = encrypted.length + uin.length + 18
	const pkt = Buffer.allocUnsafe(len)
	pkt.writeUInt32BE(len, 0)
	pkt.writeUInt32BE(0x0B, 4)
	pkt.writeUInt8(1, 8) //type
	pkt.writeInt32BE(seq, 9)
	pkt.writeUInt8(0, 13)
	pkt.writeUInt32BE(uin.length + 4, 14)
	pkt.fill(uin, 18)
	pkt.fill(encrypted, uin.length + 18)
	return pkt
}

const EVENT_KICKOFF = Symbol("EVENT_KICKOFF")

function ssoListener(this: BaseClient, cmd: string, payload: Buffer, seq: number) {
	switch (cmd) {
	case "StatSvc.ReqMSFOffline":
	case "MessageSvc.PushForceOffline":
		{
			const nested = jce.decodeWrapper(payload)
			const msg = nested[4] ? `[${nested[4]}]${nested[3]}` : `[${nested[1]}]${nested[2]}`
			this.emit(EVENT_KICKOFF, msg)
		}
		break
	case "QualityTest.PushList":
	case "OnlinePush.SidTicketExpired":
		this.writeUni(cmd, BUF0, seq)
		break
	case "ConfigPushSvc.PushReq":
		{
			if (payload[0] === 0)
				payload = payload.slice(4)
			const nested = jce.decodeWrapper(payload)
			if (nested[1] === 2 && nested[2]) {
				const buf = jce.decode(nested[2])[5][5]
				const decoded = pb.decode(buf)[1281]
				this.sig.bigdata.sig_session = decoded[1].toBuffer()
				this.sig.bigdata.session_key = decoded[2].toBuffer()
				for (let v of decoded[3]) {
					if (v[1] === 10) {
						this.sig.bigdata.port = v[2][0][3]
						this.sig.bigdata.ip = int32ip2str(v[2][0][2])
					}
				}
			}
		}
		break
	}
}

function onlineListener(this: BaseClient) {
	if (!this.listenerCount(EVENT_KICKOFF)) {
		this.once(EVENT_KICKOFF, (msg: string) => {
			this[IS_ONLINE] = false
			clearInterval(this[HEARTBEAT])
			this.emit("internal.kickoff", msg)
		})
	}
}

function lostListener(this: BaseClient) {
	clearInterval(this[HEARTBEAT])
	if (this[IS_ONLINE]) {
		this[IS_ONLINE] = false
		this.statistics.lost_times++
		setTimeout(register.bind(this), 50)
	}
}

async function parseSso(this: BaseClient, buf: Buffer) {
	const headlen = buf.readUInt32BE()
	const seq = buf.readInt32BE(4)
	const retcode = buf.readInt32BE(8)
	if (retcode !== 0) {
		this.emit("internal.error.token")
		throw new Error("unsuccessful retcode: " + retcode)
	}
	let offset = buf.readUInt32BE(12) + 12
	let len = buf.readUInt32BE(offset) // length of cmd
	const cmd = String(buf.slice(offset + 4, offset + len))
	offset += len
	len = buf.readUInt32BE(offset) // length of session_id
	offset += len
	const flag = buf.readInt32BE(offset)
	let payload
	if (flag === 0)
		payload = buf.slice(headlen + 4)
	else if (flag === 1)
		payload = await unzip(buf.slice(headlen + 4))
	else if (flag === 8)
		payload = buf.slice(headlen)
	else
		throw new Error("unknown compressed flag: " + flag)
	return {
		seq, cmd, payload
	}
}

async function packetListener(this: BaseClient, pkt: Buffer) {
	this.statistics.recv_pkt_cnt++
	this[LOGIN_LOCK] = false
	try {
		const flag = pkt.readUInt8(4)
		const encrypted = pkt.slice(pkt.readUInt32BE(6) + 6)
		let decrypted
		switch (flag) {
		case 0:
			decrypted = encrypted
			break
		case 1:
			decrypted = tea.decrypt(encrypted, this.sig.d2key)
			break
		case 2:
			decrypted = tea.decrypt(encrypted, BUF16)
			break
		default:
			this.emit("internal.error.token")
			throw new Error("unknown flag:" + flag)
		}
		const sso = await parseSso.call(this, decrypted)
		this.emit("internal.verbose", `recv:${sso.cmd} seq:${sso.seq}`, VerboseLevel.Debug)
		if (this[HANDLERS].has(sso.seq))
			this[HANDLERS].get(sso.seq)?.(sso.payload)
		else
			this.emit("internal.sso", sso.cmd, sso.payload, sso.seq)
	} catch (e) {
		this.emit("internal.verbose", e, VerboseLevel.Error)
	}
}

async function register(this: BaseClient, logout = false, reflush = false) {
	this[IS_ONLINE] = false
	clearInterval(this[HEARTBEAT])
	const pb_buf = pb.encode({
		1: [
			{ 1: 46, 2: timestamp() },
			{ 1: 283, 2: 0 }
		]
	})
	const d = this.device
	const SvcReqRegister = jce.encodeStruct([
		this.uin,
		(logout ? 0 : 7), 0, "", (logout ? 21 : 11), 0,
		0, 0, 0, 0, (logout ? 44 : 0),
		d.version.sdk, 1, "", 0, null,
		d.guid, 2052, 0, d.model, d.model,
		d.version.release, 1, 0, 0, null,
		0, 0, "", 0, d.brand,
		d.brand, "", pb_buf, 0, null,
		0, null, 1000, 98
	])
	const body = jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister")
	const pkt = buildLoginPacket.call(this, "StatSvc.register", body, 1)
	try {
		const payload = await this[FN_SEND](pkt, 10)
		if (logout) return
		const rsp = jce.decodeWrapper(payload)
		const result = rsp[9] ? true : false
		if (!result && !reflush) {
			this.emit("internal.error.token")
		} else {
			this[IS_ONLINE] = true
			this[HEARTBEAT] = setInterval(async () => {
				syncTimeDiff.call(this)
				if (typeof this.heartbeat === "function")
					await this.heartbeat()
				this.sendUni("OidbSvc.0x480_9_IMCore", this.sig.hb480).catch(() => {
					this.emit("internal.verbose", "heartbeat timeout", VerboseLevel.Warn)
					this.sendUni("OidbSvc.0x480_9_IMCore", this.sig.hb480).catch(() => {
						this.emit("internal.verbose", "heartbeat timeout x 2", VerboseLevel.Error)
						this[NET].destroy()
					})
				}).then(refreshToken.bind(this))
			}, this.interval * 1000)
		}
	} catch {
		if (!logout)
			this.emit("internal.error.network", -3, "server is busy(register)")
	}
}

function syncTimeDiff(this: BaseClient) {
	const pkt = buildLoginPacket.call(this, "Client.CorrectTime", BUF4, 0)
	this[FN_SEND](pkt).then(buf => {
		try {
			this.sig.time_diff = buf.readInt32BE() - timestamp()
		} catch { }
	}).catch(NOOP)
}

async function refreshToken(this: BaseClient) {
	if (!this.isOnline() || timestamp() - this.sig.emp_time < 14000)
		return
	const t = tlv.getPacker(this)
	const body = new Writer()
		.writeU16(11)
		.writeU16(16)
		.writeBytes(t(0x100))
		.writeBytes(t(0x10a))
		.writeBytes(t(0x116))
		.writeBytes(t(0x144))
		.writeBytes(t(0x143))
		.writeBytes(t(0x142))
		.writeBytes(t(0x154))
		.writeBytes(t(0x18))
		.writeBytes(t(0x141))
		.writeBytes(t(0x8))
		.writeBytes(t(0x147))
		.writeBytes(t(0x177))
		.writeBytes(t(0x187))
		.writeBytes(t(0x188))
		.writeBytes(t(0x202))
		.writeBytes(t(0x511))
		.read()
	const pkt = buildLoginPacket.call(this, "wtlogin.exchange_emp", body)
	try {
		let payload = await this[FN_SEND](pkt)
		payload = tea.decrypt(payload.slice(16, payload.length - 1), this[ECDH].share_key)
		const stream = Readable.from(payload, { objectMode: false })
		stream.read(2)
		const type = stream.read(1).readUInt8()
		stream.read(2)
		const t = readTlv(stream)
		if (type === 0) {
			const { token } = decodeT119.call(this, t[0x119])
			await register.call(this, false, true)
			if (this[IS_ONLINE])
				this.emit("internal.token", token)
		}
	} catch (e: any) {
		this.emit("internal.verbose", "refresh token error: " + e?.message, VerboseLevel.Error)
	}
}

function readTlv(r: Readable) {
	const t: {[tag: number]: Buffer} = { }
	while (r.readableLength > 2) {
		const k = r.read(2).readUInt16BE() as number
		t[k] = r.read(r.read(2).readUInt16BE())
	}
	return t
}

type LoginCmd = "wtlogin.login" | "wtlogin.exchange_emp" | "wtlogin.trans_emp" | "StatSvc.register" | "Client.CorrectTime"
type LoginCmdType = 0 | 1 | 2

function buildLoginPacket(this: BaseClient, cmd: LoginCmd, body: Buffer, type: LoginCmdType = 2): Buffer {
	this[FN_NEXT_SEQ]()
	this.emit("internal.verbose", `send:${cmd} seq:${this.sig.seq}`, VerboseLevel.Debug)
	let uin = this.uin, cmdid = 0x810, subappid = this.apk.subid
	if (cmd === "wtlogin.trans_emp") {
		uin = 0
		cmdid = 0x812
		subappid = getApkInfo(Platform.Watch).subid
	}
	if (type === 2) {
		body = new Writer()
			.writeU8(0x02)
			.writeU8(0x01)
			.writeBytes(this.sig.randkey)
			.writeU16(0x131)
			.writeU16(0x01)
			.writeTlv(this[ECDH].public_key)
			.writeBytes(tea.encrypt(body, this[ECDH].share_key))
			.read()
		body = new Writer()
			.writeU8(0x02)
			.writeU16(29 + body.length) // 1 + 27 + body.length + 1
			.writeU16(8001)             // protocol ver
			.writeU16(cmdid)            // command id
			.writeU16(1)                // const
			.writeU32(uin)
			.writeU8(3)                 // const
			.writeU8(0x87)              // encrypt type 7:0 69:emp 0x87:4
			.writeU8(0)                 // const
			.writeU32(2)                // const
			.writeU32(0)                // app client ver
			.writeU32(0)                // const
			.writeBytes(body)
			.writeU8(0x03)
			.read()
	}
	let sso = new Writer()
		.writeWithLength(new Writer()
			.writeU32(this.sig.seq)
			.writeU32(subappid)
			.writeU32(subappid)
			.writeBytes(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]))
			.writeWithLength(this.sig.tgt)
			.writeWithLength(cmd)
			.writeWithLength(this.sig.session)
			.writeWithLength(this.device.imei)
			.writeU32(4)
			.writeU16(2)
			.writeU32(4)
			.read()
		)
		.writeWithLength(body)
		.read()
	if (type === 1)
		sso = tea.encrypt(sso, this.sig.d2key)
	else if (type === 2)
		sso = tea.encrypt(sso, BUF16)
	return new Writer()
		.writeWithLength(new Writer()
			.writeU32(0x0A)
			.writeU8(type)
			.writeWithLength(this.sig.d2)
			.writeU8(0)
			.writeWithLength(String(uin))
			.writeBytes(sso)
			.read()
		)
		.read()
}

function buildCode2dPacket(this: BaseClient, cmdid: number, head: number, body: Buffer) {
	body = new Writer()
		.writeU32(head)
		.writeU32(0x1000)
		.writeU16(0)
		.writeU32(0x72000000)
		.writeU32(timestamp())
		.writeU8(2)
		.writeU16(44 + body.length)
		.writeU16(cmdid)
		.writeBytes(Buffer.alloc(21))
		.writeU8(3)
		.writeU16(0)
		.writeU16(50)
		.writeU32(this.sig.seq + 1)
		.writeU64(0)
		.writeBytes(body)
		.writeU8(3)
		.read()
	return buildLoginPacket.call(this, "wtlogin.trans_emp", body)
}

function decodeT119(this: BaseClient, t119: Buffer) {
	const r = Readable.from(tea.decrypt(t119, this.sig.tgtgt), { objectMode: false })
	r.read(2)
	const t = readTlv(r)
	this.sig.tgt = t[0x10a]
	this.sig.skey = t[0x120]
	this.sig.d2 = t[0x143]
	this.sig.d2key = t[0x305]
	this.sig.tgtgt = md5(this.sig.d2key)
	this.sig.emp_time = timestamp()
	if (t[0x512]) {
		const r = Readable.from(t[0x512], { objectMode: false })
		let len = r.read(2).readUInt16BE()
		while (len-- > 0) {
			const domain = String(r.read(r.read(2).readUInt16BE()))
			const pskey = r.read(r.read(2).readUInt16BE()) as Buffer
			const pt4token = r.read(r.read(2).readUInt16BE())
			this.pskey[domain] = pskey
		}
	}
	const token = Buffer.concat([
		this.sig.d2key,
		this.sig.d2,
		this.sig.tgt,
	])
	const age = t[0x11a].slice(2, 3).readUInt8()
	const gender = t[0x11a].slice(3, 4).readUInt8()
	const nickname = String(t[0x11a].slice(5))
	return { token, nickname, gender, age }
}

function decodeLoginResponse(this: BaseClient, payload: Buffer): any {
	payload = tea.decrypt(payload.slice(16, payload.length - 1), this[ECDH].share_key)
	const r = Readable.from(payload, { objectMode: false })
	r.read(2)
	const type = r.read(1).readUInt8() as number
	r.read(2)
	const t = readTlv(r)

	if (type === 204) {
		this.sig.t104 = t[0x104]
		this.emit("internal.verbose", "unlocking...", VerboseLevel.Mark)
		const tt = tlv.getPacker(this)
		const body = new Writer()
			.writeU16(20)
			.writeU16(4)
			.writeBytes(tt(0x8))
			.writeBytes(tt(0x104))
			.writeBytes(tt(0x116))
			.writeBytes(tt(0x401))
			.read()
		return this[FN_SEND_LOGIN]("wtlogin.login", body)
	}

	if (type === 0) {
		this.sig.t104 = BUF0
		this.sig.t174 = BUF0
		const { token, nickname, gender, age } = decodeT119.call(this, t[0x119])
		return register.call(this).then(() => {
			if (this[IS_ONLINE])
				this.emit("internal.online", token, nickname, gender, age)
		})
	}

	if (type === 15 || type === 16) {
		return this.emit("internal.error.token")
	}

	if (type === 2) {
		this.sig.t104 = t[0x104]
		if (t[0x192])
			return this.emit("internal.slider", String(t[0x192]))
		return this.emit("internal.error.login", type, "[登陆失败]未知格式的验证码")
	}

	if (type === 160) {
		if (!t[0x204] && !t[0x174])
			return this.emit("internal.verbose", "已向密保手机发送短信验证码", VerboseLevel.Mark)
		let phone = ""
		if (t[0x174] && t[0x178]) {
			this.sig.t104 = t[0x104]
			this.sig.t174 = t[0x174]
			phone = String(t[0x178]).substr(t[0x178].indexOf("\x0b") + 1, 11)
		}
		return this.emit("internal.verify", String(t[0x204]), phone)
	}

	if (t[0x149]) {
		const stream = Readable.from(t[0x149], { objectMode: false })
		stream.read(2)
		const title = stream.read(stream.read(2).readUInt16BE()).toString()
		const content = stream.read(stream.read(2).readUInt16BE()).toString()
		return this.emit("internal.error.login", type, `[${title}]${content}`)
	}

	if (t[0x146]) {
		const stream = Readable.from(t[0x146], { objectMode: false })
		const version = stream.read(4)
		const title = stream.read(stream.read(2).readUInt16BE()).toString()
		const content = stream.read(stream.read(2).readUInt16BE()).toString()
		return this.emit("internal.error.login", type, `[${title}]${content}`)
	}

	this.emit("internal.error.login", type, `[登陆失败]未知错误`)
}

