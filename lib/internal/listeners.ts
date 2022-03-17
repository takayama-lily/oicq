import * as fs from "fs"
import * as path from "path"
import jsqr from "jsqr"
import { PNG } from "pngjs"
import qrt from "qrcode-terminal"
import { jce, pb } from "../core"
import { NOOP, OnlineStatus } from "../common"
import { getFrdSysMsg, getGrpSysMsg } from "./sysmsg"
import { pbGetMsg, pushReadedListener } from "./pbgetmsg"
import { dmMsgSyncListener, groupMsgListener, discussMsgListener, onlinePushListener, onlinePushTransListener } from "./onlinepush"
import { guildMsgListener } from "./guild"

type Client = import("../client").Client

async function pushNotifyListener(this: Client, payload: Buffer) {
	if (!this._sync_cookie) return
	try {
		var nested = jce.decodeWrapper(payload.slice(4))
	} catch {
		var nested = jce.decodeWrapper(payload.slice(15))
	}
	switch (nested[5]) {
	case 33: //群员入群
	case 38: //建群
	case 85: //群申请被同意
	case 141: //陌生人
	case 166: //好友
	case 167: //单向好友
	case 208: //好友语音
	case 529: //离线文件
		return pbGetMsg.call(this)
	case 84: //群请求
	case 87: //群邀请
	case 525: //群请求(来自群员的邀请)
		return getGrpSysMsg.call(this)
	case 187: //好友请求
	case 191: //单向好友增加
		return getFrdSysMsg.call(this)
	case 528: //黑名单同步
		return this.reloadBlackList()
	}
}

const events = {
	"OnlinePush.PbPushGroupMsg": groupMsgListener,
	"OnlinePush.PbPushDisMsg": discussMsgListener,
	"OnlinePush.ReqPush": onlinePushListener,
	"OnlinePush.PbPushTransMsg": onlinePushTransListener,
	"OnlinePush.PbC2CMsgSync": dmMsgSyncListener,
	"MessageSvc.PushNotify": pushNotifyListener,
	"MessageSvc.PushReaded": pushReadedListener,
	// "trpc.group_pro.synclogic.SyncLogic.PushFirstView": guildListPushListener,
	"MsgPush.PushGroupProMsg": guildMsgListener,
}

/** 事件总线, 在这里捕获奇怪的错误 */
async function eventsListener(this: Client, cmd: string, payload: Buffer, seq: number) {
	try {
		await Reflect.get(events, cmd)?.call(this, payload, seq)
	} catch (e) {
		this.logger.trace(e)
	}
}

/** 上线后加载资源 */
async function onlineListener(this: Client, token: Buffer, nickname: string, gender: number, age: number) {
	this.nickname = nickname
	this.age = age
	this.sex = gender ? (gender === 1 ? "male" : "female") : "unknown"
	// 恢复之前的状态
	this.status = this.status || OnlineStatus.Online
	this.setOnlineStatus(this.status).catch(NOOP)
	// 存token
	tokenUpdatedListener.call(this, token)
	this.logger.mark(`Welcome, ${this.nickname} ! 正在加载资源...`)
	await Promise.allSettled([
		this.reloadFriendList(),
		this.reloadGroupList(),
		this.reloadStrangerList(),
		this.reloadBlackList(),
	])
	await this.sendUni("trpc.group_pro.synclogic.SyncLogic.SyncFirstView", pb.encode({ 1: 0, 2: 0, 3: 0 })).then(payload => {
		this.tiny_id = String(pb.decode(payload)[6])
	}).catch(NOOP)
	this.logger.mark(`加载了${this.fl.size}个好友，${this.gl.size}个群，${this.sl.size}个陌生人`)
	pbGetMsg.call(this).catch(NOOP)
	this.em("system.online")
}

function tokenUpdatedListener(this: Client, token: Buffer) {
	fs.writeFile(path.join(this.dir, "token"), token, NOOP)
}

function kickoffListener(this: Client, message: string) {
	this.logger.warn(message)
	this.terminate()
	fs.unlink(path.join(this.dir, "token"), () => {
		this.em("system.offline.kickoff", { message })
	})
}

function qrcodeListener(this: Client, image: Buffer) {
	const file = path.join(this.dir, "qrcode.png")
	fs.writeFile(file, image, () => {
		try {
			const qrdata = PNG.sync.read(image)
			const qr = jsqr(new Uint8ClampedArray(qrdata.data), qrdata.width, qrdata.height)!
			qrt.generate(qr.data, console.log as any)
		} catch { }
		this.logger.mark("请用手机QQ扫描二维码，若打印出错请打开：" + file)
		this.em("system.login.qrcode", { image })
	})
}

function sliderListener(this: Client, url: string) {
	this.logger.mark("收到滑动验证码，请访问以下地址完成滑动，并从网络响应中取出ticket输入：" + url)
	this.em("system.login.slider", { url })
}

function verifyListener(this: Client, url: string, phone: string) {
	this.logger.mark("登录保护二维码验证地址：" + url.replace("verify", "qrcode"))
	this.logger.mark("密保手机号：" + phone)
	return this.em("system.login.device", { url, phone })
}

/**
 * 登录相关错误
 * @param code -2服务器忙 -3上线失败(需要删token)
 */
function loginErrorListener(this: Client, code: number, message: string) {
	// toke expired
	if (!code) {
		this.logger.mark("登录token过期")
		fs.unlink(path.join(this.dir, "token"), () => {
			this.login()
		})
	}
	// network error
	else if (code < 0) {
		this.terminate()
		this.logger.error(message)
		if (code === -3) //register failed
			fs.unlink(path.join(this.dir, "token"), NOOP)
		const t = this.config.reconn_interval
		if (t >= 1) {
			this.logger.mark(t + "秒后重新连接")
			setTimeout(this.login.bind(this), t * 1000)
		}
		this.em("system.offline.network", { message })
	}
	// login error
	else if (code > 0) {
		this.logger.error(message)
		this.em("system.login.error", { code, message })
	}
}

function qrcodeErrorListener(this: Client, code: number, message: string) {
	this.logger.error(`二维码扫码遇到错误: ${code} (${message})`)
	this.logger.mark("二维码已更新")
	this.login()
}

export function bindInternalListeners(this: Client) {
	this.on("internal.online", onlineListener)
	this.on("internal.kickoff", kickoffListener)
	this.on("internal.token", tokenUpdatedListener)
	this.on("internal.qrcode", qrcodeListener)
	this.on("internal.slider", sliderListener)
	this.on("internal.verify", verifyListener)
	this.on("internal.error.token", loginErrorListener)
	this.on("internal.error.login", loginErrorListener)
	this.on("internal.error.qrcode", qrcodeErrorListener)
	this.on("internal.error.network", loginErrorListener)
	this.on("internal.sso", eventsListener)
}
