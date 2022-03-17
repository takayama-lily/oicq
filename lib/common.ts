import * as fs from "fs"
import * as crypto from "crypto"
import * as stream from "stream"
import * as util from "util"
import * as os from "os"
import { pb } from "./core"

export function uuid() {
	let hex = crypto.randomBytes(16).toString("hex")
	return hex.substr(0, 8) + "-" + hex.substr(8, 4) + "-" + hex.substr(12, 4) + "-" + hex.substr(16, 4) + "-" + hex.substr(20)
}

/** 计算流的md5 */
export function md5Stream(readable: stream.Readable) {
	return new Promise((resolve, reject) => {
		readable.on("error", reject)
		readable.pipe(
			crypto.createHash("md5")
				.on("error", reject)
				.on("data", resolve)
		)
	}) as Promise<Buffer>
}

/** 计算文件的md5和sha */
export function fileHash(filepath: string) {
	const readable = fs.createReadStream(filepath)
	const sha = new Promise((resolve, reject) => {
		readable.on("error", reject)
		readable.pipe(
			crypto.createHash("sha1")
				.on("error", reject)
				.on("data", resolve)
		)
	}) as Promise<Buffer>
	return Promise.all([md5Stream(readable), sha])
}

/** 群号转uin */
export function code2uin(code: number) {
	let left = Math.floor(code / 1000000)
	if (left >= 0 && left <= 10)
		left += 202
	else if (left >= 11 && left <= 19)
		left += 469
	else if (left >= 20 && left <= 66)
		left += 2080
	else if (left >= 67 && left <= 156)
		left += 1943
	else if (left >= 157 && left <= 209)
		left += 1990
	else if (left >= 210 && left <= 309)
		left += 3890
	else if (left >= 310 && left <= 335)
		left += 3490
	else if (left >= 336 && left <= 386)
		left += 2265
	else if (left >= 387 && left <= 499)
		left += 3490

	return left * 1000000 + code % 1000000
}

/** uin转群号 */
export function uin2code(uin: number) {
	let left = Math.floor(uin / 1000000)
	if (left >= 202 && left <= 212)
		left -= 202
	else if (left >= 480 && left <= 488)
		left -= 469
	else if (left >= 2100 && left <= 2146)
		left -= 2080
	else if (left >= 2010 && left <= 2099)
		left -= 1943
	else if (left >= 2147 && left <= 2199)
		left -= 1990
	else if (left >= 2600 && left <= 2651)
		left -= 2265
	else if (left >= 3800 && left <= 3989)
		left -= 3490
	else if (left >= 4100 && left <= 4199)
		left -= 3890
	return left * 1000000 + uin % 1000000
}

/** 解析彩色群名片 */
export function parseFunString(buf: Buffer) {
	if (buf[0] === 0xA) {
		let res = ""
		try {
			let arr = pb.decode(buf)[1]
			if (!Array.isArray(arr))
				arr = [arr]
			for (let v of arr) {
				if (v[2])
					res += String(v[2])
			}
		} catch { }
		return res
	} else {
		return String(buf)
	}
}

/** xml转义 */
export function escapeXml(str: string) {
	return str.replace(/[&"><]/g, function (s: string) {
		if (s === "&") return "&amp;"
		if (s === "<") return "&lt;"
		if (s === ">") return "&gt;"
		if (s === "\"") return "&quot;"
		return ""
	})
}

export function log(any: any) {
	if (any instanceof Buffer)
		any = any.toString("hex").replace(/(.)(.)/g, '$1$2 ')
	console.log(util.inspect(any, { depth: 20, showHidden: false, maxArrayLength: 1000, maxStringLength: 20000 }))
}

/** 用于下载限量 */
export class DownloadTransform extends stream.Transform {
	_size = 0
	_transform(data: Buffer, encoding: BufferEncoding, callback: stream.TransformCallback) {
		this._size += data.length
		let error = null
		if (this._size <= MAX_UPLOAD_SIZE)
			this.push(data)
		else
			error = new Error("downloading over 30MB is refused")
		callback(error)
	}
}

export const PB_CONTENT = pb.encode({ 1: 1, 2: 0, 3: 0 })
export const IS_WIN = os.platform() === "win32"

/** 系统临时目录，用于临时存放下载的图片等内容 */
export const TMP_DIR = os.tmpdir()

/** 最大上传和下载大小，以图片上传限制为准：30MB */
export const MAX_UPLOAD_SIZE = 31457280

/** 性别 */
export type Gender = "male" | "female" | "unknown"

/** 群内权限 */
export type GroupRole = "owner" | "admin" | "member"

/** 可设置的在线状态 */
export enum OnlineStatus {
	Online = 11,
	Absent = 31,
	Invisible = 41,
	Busy = 50,
	Qme = 60,
	DontDisturb = 70,
}

export * from "./core/constants"
