import { BinaryLike, createHash } from "crypto"
import { promisify } from "util"
import * as zlib from "zlib"
import * as stream from "stream"

export const BUF0 = Buffer.alloc(0)
export const BUF16 = Buffer.alloc(16)
export const NOOP = () => { }
export const unzip = promisify(zlib.unzip)
export const pipeline = promisify(stream.pipeline)
export const md5 = (data: BinaryLike) => createHash("md5").update(data).digest()
export const sha = (data: BinaryLike) => createHash("sha1").update(data).digest()
export const timestamp = () => Math.floor(Date.now() / 1000)
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

export function hide(obj: any, prop: string) {
	Reflect.defineProperty(obj, prop, {
		configurable: false,
		enumerable: false,
		writable: false,
	})
}
