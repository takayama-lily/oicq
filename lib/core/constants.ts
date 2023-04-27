import {BinaryLike, createHash} from "crypto"
import {promisify} from "util"
import * as zlib from "zlib"
import * as stream from "stream"

/** 一个0长buf */
export const BUF0 = Buffer.alloc(0)

/** 4个0的buf */
export const BUF4 = Buffer.alloc(4)

/** 16个0的buf */
export const BUF16 = Buffer.alloc(16)

/** no operation */
export const NOOP = () => {
}

/** promisified unzip */
export const unzip = promisify(zlib.unzip)

/** promisified gzip */
export const gzip = promisify(zlib.gzip)

/** promisified pipeline */
export const pipeline = promisify(stream.pipeline)

/** md5 hash */
export const md5 = (data: BinaryLike) => createHash("md5").update(data).digest()

/** sha hash */
export const sha = (data: BinaryLike) => createHash("sha1").update(data).digest()

/** unix timestamp (second) */
export const timestamp = () => Math.floor(Date.now() / 1000)

/** 数字ip转通用ip */
export function int32ip2str(ip: number | string) {
	if (typeof ip === "string")
		return ip
	ip = ip & 0xffffffff
	return [
		ip & 0xff,
		(ip & 0xff00) >> 8,
		(ip & 0xff0000) >> 16,
		(ip & 0xff000000) >> 24 & 0xff,
	].join(".")
}

/** 隐藏并锁定一个属性 */
export function lock(obj: any, prop: string) {
	Reflect.defineProperty(obj, prop, {
		configurable: false,
		enumerable: false,
		writable: false,
	})
}

/** 隐藏一个属性 */
export function hide(obj: any, prop: string) {
	Reflect.defineProperty(obj, prop, {
		configurable: false,
		enumerable: false,
		writable: true,
	})
}

export const randomString = (n: number, template: string) => {
	const len = template.length
	return new Array(n).fill(false).map(() => template.charAt(Math.floor(Math.random() * len))).join('')
}

export function formatDateTime(t: Date, format: string) {
	const year = t.getFullYear()
	const month = t.getMonth() + 1
	const date = t.getDate()
	const hour = t.getHours()
	const min = t.getMinutes()
	const second = t.getSeconds()
	format = format.replace(/[y]+/g, String(year)).replace(/[M]+/g, String(month).padStart(2, '0'))
		.replace(/[d]+/g, String(date).padStart(2, '0')).replace(/[h]+/g, String(date).padStart(2, '0'))
		.replace(/[h]+/g, String(hour).padStart(2, '0')).replace(/[m]+/g, String(min).padStart(2, '0'))
		.replace(/[s]+/g, String(second).padStart(2, '0'))
	return format
}