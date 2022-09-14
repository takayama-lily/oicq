import * as stream from "stream"
import * as net from "net"
import { randomBytes } from "crypto"
import http from "http"
import axios, { CancelTokenSource } from "axios"
import { tea, pb, ApiRejection } from "../core"
import { ErrorCode } from "../errors"
import { md5, NOOP, BUF0, int32ip2str, log } from "../common"

type Client = import("../client").Client

export enum CmdID {
	DmImage = 1,
	GroupImage = 2,
	SelfPortrait = 5,
	ShortVideo = 25,
	DmPtt = 26,
	MultiMsg = 27,
	GroupPtt = 29,
	OfflineFile = 69,
	GroupFile = 71,
	Ocr = 76,
}

/** 上传时的附加数据，必须知道流的size和md5 */
export interface HighwayUploadExt {
	cmdid: CmdID
	size: number
	md5: Buffer
	ticket?: Buffer
	ext?: Uint8Array
	encrypt?: boolean
	callback?: (percentage: string) => void
	timeout?: number
}

const __ = Buffer.from([41])
class HighwayTransform extends stream.Transform {

	seq = randomBytes(2).readUInt16BE()
	offset = 0

	constructor(protected c: Client, protected obj: HighwayUploadExt) {
		super()
		if (!obj.ticket)
			this.obj.ticket = c.sig.bigdata.sig_session
		if (obj.encrypt && obj.ext)
			this.obj.ext = tea.encrypt(obj.ext as Buffer, c.sig.bigdata.session_key)
		this.on("error", NOOP)
	}

	_transform(data: Buffer, encoding: BufferEncoding, callback: stream.TransformCallback) {
		let offset = 0, limit = 1048576
		while (offset < data.length) {
			const chunk = data.slice(offset, limit + offset)
			const head = pb.encode({
				1: {
					1: 1,
					2: String(this.c.uin),
					3: "PicUp.DataUp",
					4: this.seq++,
					6: this.c.apk.subid,
					7: 4096,
					8: this.obj.cmdid,
					10: 2052,
				},
				2: {
					2: this.obj.size,
					3: this.offset + offset,
					4: chunk.length,
					6: this.obj.ticket,
					8: md5(chunk),
					9: this.obj.md5,
				},
				3: this.obj.ext
			})
			offset += chunk.length
			const _ = Buffer.allocUnsafe(9)
			_.writeUInt8(40)
			_.writeUInt32BE(head.length, 1)
			_.writeUInt32BE(chunk.length, 5)
			this.push(_)
			this.push(head)
			this.push(chunk)
			this.push(__)
		}
		this.offset += data.length
		callback(null)
	}
}

/** highway上传数据 (只能上传流) */
export function highwayUpload(this: Client, readable: stream.Readable, obj: HighwayUploadExt, ip?: string | number, port?: number): Promise<pb.Proto | void> {
	ip = int32ip2str(ip || this.sig.bigdata.ip)
	port = port || this.sig.bigdata.port
	if (!port) throw new ApiRejection(ErrorCode.NoUploadChannel, "没有上传通道，如果你刚刚登录，请等待几秒")
	if (!readable) throw new ApiRejection(ErrorCode.HighwayFileTypeError, "不支持的file类型")
	this.logger.debug(`highway ip:${ip} port:${port}`)
	return new Promise((resolve, reject) => {
		const highway = new HighwayTransform(this, obj)
		const socket = net.connect(
			port as number, ip as string,
			() => { readable.pipe(highway).pipe(socket, { end: false }) }
		)
		const handleRspHeader = (header: Buffer) => {
			const rsp = pb.decode(header)
			if (typeof rsp[3] === "number" && rsp[3] !== 0) {
				this.logger.warn(`highway upload failed (code: ${rsp[3]})`)
				readable.unpipe(highway).destroy()
				highway.unpipe(socket).destroy()
				socket.end()
				reject(new ApiRejection(rsp[3], "unknown highway error"))
			} else {
				const percentage = ((rsp[2][3] + rsp[2][4]) / rsp[2][2] * 100).toFixed(2)
				this.logger.debug(`highway chunk uploaded (${percentage}%)`)
				if (typeof obj.callback === "function")
					obj.callback(percentage)
				if (Number(percentage) >= 100) {
					socket.end()
					resolve(rsp[7])
				}
			}
		}
		let buf = BUF0
		socket.on("data", (chunk: Buffer) => {
			try {
				buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
				while (buf.length >= 5) {
					const len = buf.readInt32BE(1)
					if (buf.length >= len + 10) {
						handleRspHeader(buf.slice(9, len + 9))
						buf = buf.slice(len + 10)
					} else {
						break
					}
				}
			} catch (err) {
				this.logger.error(err)
			}
		})
		socket.on("close", () => {
			reject(new ApiRejection(ErrorCode.HighwayNetworkError, "上传遇到网络错误"))
		})
		socket.on("error", (err: Error) => {
			this.logger.error(err)
		})
		readable.on("error", (err) => {
			this.logger.error(err)
			socket.end()
		})
		if (obj.timeout! > 0) {
			setTimeout(() => {
				socket.end()
				reject(new ApiRejection(ErrorCode.HighwayTimeout, `上传超时(${obj.timeout}s)`))
			}, obj.timeout! * 1000)
		}
	})
}

const agent = new http.Agent({ maxSockets: 10 })

export function highwayHttpUpload(this: Client, readable: stream.Readable, obj: HighwayUploadExt) {
	const ip = this.sig.bigdata.ip
	const port = this.sig.bigdata.port
	if (!port) throw new ApiRejection(ErrorCode.NoUploadChannel, "没有上传通道，如果你刚刚登录，请等待几秒")

	this.logger.debug(`highway(http) ip:${ip} port:${port}`)
	const url = "http://" + ip + ":" + port + "/cgi-bin/httpconn?htcmd=0x6FF0087&uin=" + this.uin
	let seq = 1
	let offset = 0, limit = 524288
	obj.ticket = this.sig.bigdata.sig_session

	const tasks = new Set<Promise<any>>()
	const cancels = new Set<CancelTokenSource>()
	let finished = 0

	readable.on("data", data => {
		let _offset = 0
		while (_offset < data.length) {
			const chunk = data.slice(_offset, limit + _offset)
			const head = pb.encode({
				1: {
					1: 1,
					2: String(this.uin),
					3: "PicUp.DataUp",
					4: seq++,
					5: 0,
					6: this.apk.subid,
					8: obj.cmdid,
				},
				2: {
					1: 0,
					2: obj.size,
					3: offset + _offset,
					4: chunk.length,
					6: obj.ticket,
					8: md5(chunk),
					9: obj.md5,
					10: 0,
					13: 0,
				},
				3: obj.ext,
				4: Date.now()
			})
			_offset += chunk.length
			const _ = Buffer.allocUnsafe(9)
			_.writeUInt8(40)
			_.writeUInt32BE(head.length, 1)
			_.writeUInt32BE(chunk.length, 5)
			const buf = Buffer.concat([_, head, chunk, __])
			const task = new Promise((resolve, reject) => {
				const c = axios.CancelToken.source()
				cancels.add(c)
				axios.post(url, buf, {
					responseType: "arraybuffer",
					httpAgent: agent,
					cancelToken: c.token,
					headers: {
						"Content-Length": String(buf.length)
					}
				}).then(r => {
					let percentage, rsp
					try {
						const buf = Buffer.from(r?.data)
						const header = buf.slice(9, buf.length - 1)
						rsp = pb.decode(header)
					} catch (err) {
						this.logger.error(err)
						reject(err)
						return
					}
					if (rsp?.[3] !== 0) {
						reject(new ApiRejection(rsp[3], "unknown highway error"))
						return
					}
					++finished
					percentage = (finished / tasks.size * 100).toFixed(2)
					this.logger.debug(`highway(http) chunk uploaded (${percentage}%)`)
					if (typeof obj.callback === "function" && percentage)
						obj.callback(percentage)
					if (finished < tasks.size && rsp[7]?.toBuffer().length > 0) {
						cancels.forEach(c => c.cancel())
						this.logger.debug(`highway(http) chunk uploaded (100.00%)`)
						if (typeof obj.callback === "function")
							obj.callback("100.00")
					}
					if (finished >= tasks.size && !rsp[7]?.toBuffer().length)
						reject(new ApiRejection(ErrorCode.UnsafeFile, "文件校验未通过，上传失败"))
					resolve(undefined)
				}).catch(reject)
			})
			tasks.add(task)
		}
		offset += data.length
	})

	return new Promise((resolve, reject) => {
		readable.on("err", reject)
		.on("end", () => {
			Promise.all(tasks).then(resolve).catch(err => {
				if (err instanceof axios.Cancel === false) {
					cancels.forEach(c => c.cancel())
					reject(err)
				}
				resolve(undefined)
			})
		})
	})
}
