import { Readable, Transform } from "stream"
import fs from "fs"
import path from "path"
import { randomBytes } from "crypto"
import probe from "probe-image-size"
import axios from "axios"
import { md5, md5Stream, pipeline, uuid, NOOP,
	TMP_DIR, IS_WIN, MAX_UPLOAD_SIZE, DownloadTransform } from "../common"
import { ImageElem, FlashElem } from "./elements"

const TYPE: {[ext: string]: number} = {
	jpg: 1000,
	png: 1001,
	webp: 1002,
	bmp: 1005,
	gif: 2000,
	face: 4,
}

const EXT: {[type: number]: string} = {
	3: "png",
	4: "face",
	1000: "jpg",
	1001: "png",
	1002: "webp",
	1003: "jpg",
	1005: "bmp",
	2000: "gif",
	2001: "png",
}

/** 构造图片file */
export function buildImageFileParam(md5: string, size?: number, width?: number, height?: number, type?: number) {
	size = size || 0
	width = width || 0
	height = height || 0
	const ext = EXT[type as number] || "jpg"
	return md5 + size + "-" + width + "-" + height + "." + ext
}

/** 从图片的file中解析出图片属性参数 */
export function parseImageFileParam(file: string) {
	let md5: string, size: number, width: number, height: number, ext: string
	let sp = file.split("-")
	md5 = sp[0].slice(0, 32)
	size = Number(sp[0].slice(32)) || 0
	width = Number(sp[1]) || 0
	height = parseInt(sp[2]) || 0
	sp = file.split(".")
	ext = sp[1] || "jpg"
	return { md5, size, width, height, ext }
}

export class Image {

	/** 最终用于发送的对象 */
	proto: {[tag: number]: any} = { }
	/** 用于上传的文件流 */
	readable?: Readable
	/** 实例化后必须等待此异步任务完成后才能上传图片 */
	task: Promise<void>

	/** 从服务端拿到fid后必须设置此值，否则图裂 */
	set fid(val: any) {
		this._fid = val
		if (this.dm) {
			this.proto[3] = val
			this.proto[10] = val
		} else {
			this.proto[7] = val
		}
	}

	private _fid?: any

	/** 图片属性 */
	md5 = randomBytes(16)
	size = 0xffff
	width = 320
	height = 240
	type = 1000
	origin?: boolean
	private asface?: boolean

	/** 缓存文件路径 */
	private cachefile?: string
	/** 临时文件路径 */
	private tmpfile?: string

	/** @param dm 是否私聊图片 */
	constructor(elem: ImageElem | FlashElem, private dm = false, private cachedir?: string) {
		let { file, cache, timeout, headers, asface, origin } = elem
		this.origin = origin
		this.asface = asface
		this.setProto()
		if (file instanceof Buffer) {
			this.task = this.fromProbeSync(file)
		} else if (file instanceof Readable) {
			this.task = this.fromReadable(file)
		} else if (typeof file !== "string") {
			throw new Error("bad file param: " + file)
		} else if (file.startsWith("base64://")) {
			this.task = this.fromProbeSync(Buffer.from(file.slice(9), "base64"))
		} else if (file.startsWith("http://") || file.startsWith("https://")) {
			this.task = this.fromWeb(file, cache, headers, timeout)
		} else {
			this.task = this.fromLocal(file)
		}
	}

	private setProperties(dimensions: probe.ProbeResult | null) {
		if (!dimensions)
			throw new Error("bad image file")
		this.width = dimensions.width
		this.height = dimensions.height
		this.type = TYPE[dimensions.type] || 1000
	}

	private parseFileParam(file: string) {
		const { md5, size, width, height, ext } = parseImageFileParam(file)
		const hash = Buffer.from(md5, "hex")
		if (hash.length !== 16)
			throw new Error("bad file param: " + file)
		this.md5 = hash
		size > 0 && (this.size = size)
		this.width = width
		this.height = height
		TYPE[ext] & (this.type = TYPE[ext])
		this.setProto()
	}

	private async fromProbeSync(buf: Buffer) {
		const dimensions = probe.sync(buf)
		this.setProperties(dimensions)
		this.md5 = md5(buf)
		this.size = buf.length
		this.readable = Readable.from(buf, { objectMode: false })
		this.setProto()
	}

	private async fromReadable(readable: Readable, timeout?: number) {
		try {
			readable = readable.pipe(new DownloadTransform)
			timeout = timeout! > 0 ? timeout! : 60;
			this.tmpfile = path.join(TMP_DIR, uuid())
			var id = setTimeout(()=>{
				readable.destroy()
			}, timeout * 1000)
			const [dimensions, md5] = await Promise.all([
				// @ts-ignore
				probe(readable, true),
				md5Stream(readable),
				pipeline(readable, fs.createWriteStream(this.tmpfile)),
			])
			this.setProperties(dimensions)
			this.md5 = md5
			this.size = (await fs.promises.stat(this.tmpfile)).size
			this.readable = fs.createReadStream(this.tmpfile, { highWaterMark: 1024*256 })
			this.setProto()
		} catch (e) {
			this.deleteTmpFile()
			throw e
		} finally {
			clearTimeout(id!)
		}
	}

	private async fromWeb(url: string, cache?: boolean, headers?: any, timeout?: number) {
		if (this.cachedir) {
			this.cachefile = path.join(this.cachedir, md5(url).toString("hex"))
			if (cache) {
				try {
					this.parseFileParam(await fs.promises.readFile(this.cachefile, "utf8"))
					return
				} catch { }
			}
		}
		const readable = (await axios.get(url, {
				headers,
				responseType: "stream",
			}
		)).data as Readable
		await this.fromReadable(readable, timeout)
		this.cachefile && fs.writeFile(
			this.cachefile,
			buildImageFileParam(this.md5.toString("hex"), this.size, this.width, this.height, this.type),
			NOOP
		)
	}

	private async fromLocal(file: string) {
		try {
			//收到的图片
			this.parseFileParam(file)
		} catch {
			//本地图片
			file.startsWith("file://") && (file = file.slice(7))
			IS_WIN && file.startsWith("/") && (file = file.slice(1))
			const stat = await fs.promises.stat(file)
			if (stat.size <= 0 || stat.size > MAX_UPLOAD_SIZE)
				throw new Error("bad file size: " + stat.size)
			const readable = fs.createReadStream(file)
			const [dimensions, md5] = await Promise.all([
				// @ts-ignore
				probe(readable, true),
				md5Stream(readable)
			])
			readable.destroy()
			this.setProperties(dimensions)
			this.md5 = md5
			this.size = stat.size
			this.readable = fs.createReadStream(file, { highWaterMark: 1024*256 })
			this.setProto()
		}
	}

	private setProto() {
		let proto
		if (this.dm) {
			proto = {
				1: this.md5.toString("hex"),
				2: this.size,
				3: this._fid,
				5: this.type,
				7: this.md5,
				8: this.height,
				9: this.width,
				10: this._fid,
				13: this.origin ? 1 : 0,
				16: this.type === 4 ? 5 : 0,
				24: 0,
				25: 0,
				29: {
					1: this.asface ? 1 : 0
				},
			}
		} else {
			proto = {
				2: this.md5.toString("hex") + ".gif",
				7: this._fid,
				8: 0,
				9: 0,
				10: 66,
				12: 1,
				13: this.md5,
				// 17: 3,
				20: this.type,
				22: this.width,
				23: this.height,
				24: 200,
				25: this.size,
				26: this.origin ? 1 : 0,
				29: 0,
				30: 0,
				34: {
					1: this.asface ? 1 : 0
				},
			}
		}
		Object.assign(this.proto, proto)
	}

	/** 服务端图片失效时建议调用此函数 */
	deleteCacheFile() {
		this.cachefile && fs.unlink(this.cachefile, NOOP)
	}

	/** 图片上传完成后建议调用此函数(文件存在系统临时目录中) */
	deleteTmpFile() {
		this.tmpfile && fs.unlink(this.tmpfile, NOOP)
		this.readable?.destroy()
	}
}
