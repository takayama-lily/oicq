import { pb, jce, Platform } from "../core"
import { drop } from "../errors"
import { timestamp, Gender, OnlineStatus, uuid, log } from "../common"
import { Image } from "../message"
import { CmdID, highwayUpload } from "./highway"

type Client = import("../client").Client

const d50 = pb.encode({
	1: 10002,
	91001: 1,
	101001: 1,
	151001: 1,
	181001: 1,
	251001: 1,
})

export async function setStatus(this: Client, status: OnlineStatus) {
	if (!status)
		return false
	if ([Platform.Watch, Platform.aPad].includes(this.config.platform as Platform))
		return false
	const d = this.device
	const SvcReqRegister = jce.encodeStruct([
		this.uin,
		7, 0, "", Number(status), 0, 0, 0, 0, 0, 248,
		d.version.sdk, 0, "", 0, null, d.guid, 2052, 0, d.model, d.model,
		d.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
		"", "", null, 1, null, 0, null, 0, 0
	])
	const body = jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister")
	const payload = await this.sendUni("StatSvc.SetStatusFromClient", body)
	const ret = !!jce.decodeWrapper(payload)[9]
	if (ret)
		this.status = Number(status)
	return ret
}

export async function setSign(this: Client, sign: string) {
	const buf = Buffer.from(String(sign)).slice(0, 254)
	const body = pb.encode({
		1: 2,
		2: Date.now(),
		3: {
			1: 109,
			2: { 6: 825110830 },
			3: this.apk.ver
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
	const payload = await this.sendUni("Signature.auth", body)
	return pb.decode(payload)[1] === 0
}

export async function setAvatar(this: Client, img: Image) {
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
	const payload = await this.sendUni("HttpConn.0x6ff_501", body)
	const rsp = pb.decode(payload)[1281]
	await highwayUpload.call(this, img.readable!, {
		cmdid: CmdID.SelfPortrait,
		md5: img.md5,
		size: img.size,
		ticket: rsp[1].toBuffer()
	}, rsp[3][2][0][2], rsp[3][2][0][3])
	img.deleteTmpFile()
}

export async function getStamp(this: Client, no_cache = false) {
	if (this.stamp.size > 0 && !no_cache)
		return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`)
	const body = pb.encode({
		1: {
			1: 109,
			2: "7.1.2",
			3: this.apk.ver
		},
		2: this.uin,
		3: 1,
	})
	const payload = await this.sendUni("Faceroam.OpReq", body)
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

export async function delStamp(this: Client, id: string | string[]) {
	const body = pb.encode({
		1: {
			1: 109,
			2: "7.1.2",
			3: this.apk.ver,
		},
		2: this.uin,
		3: 2,
		5: {
			1: id
		},
	})
	await this.sendUni("Faceroam.OpReq", body)
	for (let s of id)
		this.stamp.delete(s)
}

export async function addClass(this: Client, name: string) {
	const len = Buffer.byteLength(name)
	const buf = Buffer.allocUnsafe(2 + len)
	buf.writeUInt8(0xd)
	buf.writeUInt8(len, 1)
	buf.fill(name, 2)
	const SetGroupReq = jce.encodeStruct([
		0, this.uin, buf
	])
	const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
	await this.sendUni("friendlist.SetGroupReq", body)
}

export async function delClass(this: Client, id: number) {
	const SetGroupReq = jce.encodeStruct([
		2, this.uin, Buffer.from([Number(id)])
	])
	const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
	await this.sendUni("friendlist.SetGroupReq", body)
}

export async function renameClass(this: Client, id: number, name: string) {
	const len = Buffer.byteLength(name)
	const buf = Buffer.allocUnsafe(2 + len)
	buf.writeUInt8(Number(id))
	buf.writeUInt8(len, 1)
	buf.fill(name, 2)
	const SetGroupReq = jce.encodeStruct([
		1, this.uin, buf
	])
	const body = jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq")
	await this.sendUni("friendlist.SetGroupReq", body)
}

export async function loadFL(this: Client) {
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
		const payload = await this.sendUni("friendlist.getFriendGroupList", body, 10)
		const nested = jce.decodeWrapper(payload)
		this.classes.clear()
		for (let v of nested[14])
			this.classes.set(v[0], v[1])
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

export async function loadSL(this: Client) {
	const body = pb.encode({
		1: 1,
		2: {
			1: this.sig.seq + 1
		}
	})
	const payload = await this.sendOidb("OidbSvc.0x5d2_0", body, 10)
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

export async function loadGL(this: Client) {
	const GetTroopListReqV2Simplify = jce.encodeStruct([
		this.uin, 0, null, [], 1, 8, 0, 1, 1
	])
	const body = jce.encodeWrapper({ GetTroopListReqV2Simplify }, "mqq.IMService.FriendListServiceServantObj", "GetTroopListReqV2Simplify")
	const payload = await this.sendUni("friendlist.GetTroopListReqV2", body, 10)
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
			admin_flag: !!v[11],
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

export async function loadBL(this: Client) {
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
	const payload = await this.sendUni("SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList", body)
	let protos = pb.decode(payload.slice(8))[1][6]
	this.blacklist.clear()
	if (!protos) return
	if (!Array.isArray(protos))
		protos = [protos]
	for (let proto of protos)
		this.blacklist.add(proto[1])
}

export class OcrResult {
	language: string
	wordslist: Array<{
		words: string,
		confidence: number,
		polygon: Array<{
			x: number,
			y: number,
		}>,
	}> = []
	constructor(proto: pb.Proto) {
		this.language = proto[2]?.toString() || "unknown"
		if (!Array.isArray(proto[1]))
			proto[1] = [proto[1]]
		for (let p of proto[1]) {
			this.wordslist.push({
				words: p[1]?.toString() || "",
				confidence: Number(p[2]),
				polygon: p[3][1].map((v: pb.Proto) => ({ x: Number(v[1]) || 0, y: Number(v[2]) || 0 })),
			})
		}
	}
	toString() {
		let str = ""
		for (const elem of this.wordslist)
			str += elem.words
		return str
	}
}

export async function imageOcr(this: Client, img: Image) {
	await img.task
	const url = String((await highwayUpload.call(this, img.readable!, {
		cmdid: CmdID.Ocr,
		md5: img.md5,
		size: img.size,
		ext: pb.encode({
			1: 0,
			2: uuid(),
		})
	}))?.[2])
	const body = pb.encode({
		1: 1,
		2: 0,
		3: 1,
		10: {
			1: url,
			10: img.md5.toString("hex"),
			11: img.md5.toString("hex"),
			12: img.size,
			13: img.width,
			14: img.height,
			15: 0,
		}
	})
	const payload = await this.sendOidb("OidbSvc.0xe07_0", body, 10)
	const rsp = pb.decode(payload)
	if (rsp[3] !== 0)
		drop(rsp[3], rsp[5])
	return new OcrResult(rsp[4][10])
}
