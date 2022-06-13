import fs from "fs"
import path from "path"
import querystring from "querystring"
import axios from "axios"
import { Readable } from "stream"
import { randomBytes } from "crypto"
import { exec } from "child_process"
import { tea, pb, ApiRejection } from "../core"
import { ErrorCode, drop } from "../errors"
import { escapeXml, md5, NOOP, timestamp, uuid, md5Stream, IS_WIN, TMP_DIR, gzip, unzip, int32ip2str, lock, pipeline, DownloadTransform, log } from "../common"
import { Sendable, PrivateMessage, MessageElem, ForwardMessage, Forwardable, Quotable, Image, ImageElem, VideoElem, PttElem, Converter, XmlElem, rand2uuid } from "../message"
import { CmdID, highwayUpload } from "./highway"

type Client = import("../client").Client

/** 所有用户和群的基类 */
export abstract class Contactable {

	/** 对方QQ号 */
	protected uid?: number
	/** 对方群号 */
	protected gid?: number

	// 对方账号，可能是群号也可能是QQ号
	private get target() {
		return this.uid || this.gid || this.c.uin
	}

	// 是否是 Direct Message (私聊)
	private get dm() {
		return !!this.uid
	}

	/** 返回所属的客户端对象 */
	get client() {
		return this.c
	}

	protected constructor(protected readonly c: Client) {
		lock(this, "c")
	}

	// 取私聊图片fid
	private async _offPicUp(imgs: Image[]) {
		const req: pb.Encodable[] = []
		for (const img of imgs) {
			req.push({
				1: this.c.uin,
				2: this.uid,
				3: 0,
				4: img.md5,
				5: img.size,
				6: img.md5.toString("hex"),
				7: 5,
				8: 9,
				9: 0,
				10: 0,
				11: 0, //retry
				12: 1, //bu
				13: img.origin ? 1 : 0,
				14: img.width,
				15: img.height,
				16: img.type,
				17: this.c.apk.version,
				22: 0,
			})
		}
		const body = pb.encode({
			1: 1,
			2: req,
			// 10: 3
		})
		const payload = await this.c.sendUni("LongConn.OffPicUp", body)
		return pb.decode(payload)[2] as pb.Proto | pb.Proto[]
	}

	// 取群聊图片fid
	private async _groupPicUp(imgs: Image[]) {
		const req = []
		for (const img of imgs) {
			req.push({
				1: this.gid,
				2: this.c.uin,
				3: 0,
				4: img.md5,
				5: img.size,
				6: img.md5.toString("hex"),
				7: 5,
				8: 9,
				9: 1, //bu
				10: img.width,
				11: img.height,
				12: img.type,
				13: this.c.apk.version,
				14: 0,
				15: 1052,
				16: img.origin ? 1 : 0,
				18: 0,
				19: 0,
			})
		}
		const body = pb.encode({
			1: 3,
			2: 1,
			3: req,
		})
		const payload = await this.c.sendUni("ImgStore.GroupPicUp", body)
		return pb.decode(payload)[3]
	}

	/** 上传一批图片以备发送(无数量限制)(理论上传一次所有群和好友都能发) */
	async uploadImages(imgs: Image[] | ImageElem[]) {
		this.c.logger.debug(`开始图片任务，共有${imgs.length}张图片`)
		const tasks: Promise<void>[] = []
		for (let i = 0; i < imgs.length; i++) {
			if (imgs[i] instanceof Image === false)
				imgs[i] = new Image(imgs[i] as ImageElem, this.dm, path.join(this.c.dir, "../image"))
			tasks.push((imgs[i] as Image).task)
		}
		const res1 = await Promise.allSettled(tasks) as PromiseRejectedResult[]
		for (let i = 0; i < res1.length; i++) {
			if (res1[i].status === "rejected")
				this.c.logger.warn(`图片${i+1}失败, reason: ` + res1[i].reason?.message)
		}
		let n = 0
		while (imgs.length > n) {
			let rsp = await (this.dm ? this._offPicUp : this._groupPicUp).call(this, imgs.slice(n, n + 20) as Image[])
			!Array.isArray(rsp) && (rsp = [rsp])
			const tasks: Promise<any>[] = []
			for (let i = n; i < imgs.length; ++i) {
				if (i >= n + 20) break
				tasks.push(this._uploadImage(imgs[i] as Image, rsp[i%20]))
			}
			const res2 = await Promise.allSettled(tasks) as PromiseRejectedResult[]
			for (let i = 0; i < res2.length; i++) {
				if (res2[i].status === "rejected") {
					res1[n+i] = res2[i]
					this.c.logger.warn(`图片${n+i+1}上传失败, reason: ` + res2[i].reason?.message)
				}
			}
			n += 20
		}
		this.c.logger.debug(`图片任务结束`)
		return res1
	}

	private async _uploadImage(img: Image, rsp: pb.Proto) {
		const j = this.dm ? 1 : 0
		if (rsp[2+j] !== 0)
			throw new Error(String(rsp[3+j]))
		img.fid = rsp[9+j].toBuffer?.() || rsp[9+j]
		if (rsp[4+j]) {
			img.deleteTmpFile()
			return
		}
		if (!img.readable) {
			img.deleteCacheFile()
			return
		}
		const ip = rsp[6+j]?.[0] || rsp[6+j]
		const port = rsp[7+j]?.[0] || rsp[7+j]
		return highwayUpload.call(
			this.c,
			img.readable,
			{
				cmdid: j ? CmdID.DmImage : CmdID.GroupImage,
				md5: img.md5,
				size: img.size,
				ticket: rsp[8+j].toBuffer()
			},
			ip, port
		).finally(img.deleteTmpFile.bind(img))
	}

	/** 发消息预处理 */
	protected async _preprocess(content: Sendable, source?: Quotable) {
		try {
			if (!Array.isArray(content))
				content = [content]
			if ((content[0] as MessageElem).type === "video")
				content[0] = await this.uploadVideo(content[0] as VideoElem)
			else if ((content[0] as MessageElem).type === "record")
				content[0] = await this.uploadPtt(content[0] as PttElem)
			const converter = new Converter(content, {
				dm: this.dm,
				cachedir: path.join(this.c.dir, "../image"),
				mlist: this.c.gml.get(this.gid!)
			})
			if (source)
				converter.quote(source)
			if (converter.imgs.length)
				await this.uploadImages(converter.imgs)
			return converter
		} catch (e: any) {
			drop(ErrorCode.MessageBuilderError, e.message)
		}
	}

	/** 上传一个视频以备发送(理论上传一次所有群和好友都能发) */
	async uploadVideo(elem: VideoElem): Promise<VideoElem> {
		let { file } = elem
		if (file.startsWith("protobuf://")) return elem
		file = file.replace(/^file:\/{2}/, "")
		IS_WIN && file.startsWith("/") && (file = file.slice(1))
		const thumb = path.join(TMP_DIR, uuid())
		await new Promise((resolve, reject) => {
			exec(`${this.c.config.ffmpeg_path || "ffmpeg"} -y -i "${file}" -f image2 -frames:v 1 "${thumb}"`, (error, stdout, stderr) => {
				this.c.logger.debug("ffmpeg output: " + stdout + stderr)
				fs.stat(thumb, (err) => {
					if (err) reject(new ApiRejection(ErrorCode.FFmpegVideoThumbError, "ffmpeg获取视频图像帧失败"))
					else resolve(undefined)
				})
			})
		})
		const [width, height, seconds] = await new Promise((resolve) => {
			exec(`${this.c.config.ffprobe_path || "ffprobe"} -i "${file}" -show_streams`, (error, stdout, stderr) => {
				const lines = (stdout || stderr || "").split("\n")
				let width = 1280, height = 720, seconds = 120
				for (const line of lines) {
					if (line.startsWith("width=")) {
						width = parseInt(line.slice(6))
					} else if (line.startsWith("height=")) {
						height = parseInt(line.slice(7))
					} else if (line.startsWith("duration=")) {
						seconds = parseInt(line.slice(9))
						break
					}
				}
				resolve([width, height, seconds])
			})
		})
		const md5video = await md5Stream(fs.createReadStream(file))
		const md5thumb = await md5Stream(fs.createReadStream(thumb))
		const name = md5video.toString("hex") + ".mp4"
		const videosize = (await fs.promises.stat(file)).size
		const thumbsize = (await fs.promises.stat(thumb)).size
		const ext = pb.encode({
			1: this.c.uin,
			2: this.target,
			3: 1,
			4: 2,
			5: {
				1: name,
				2: md5video,
				3: md5thumb,
				4: videosize,
				5: height,
				6: width,
				7: 3,
				8: seconds,
				9: thumbsize,
			},
			6: this.target,
			20: 1,
		})
		const body = pb.encode({
			1: 300,
			3: ext,
			100: {
				1: 0,
				2: 1,
			}
		})
		const payload = await this.c.sendUni("PttCenterSvr.GroupShortVideoUpReq", body)
		const rsp = pb.decode(payload)[3]
		if (rsp[1])
			throw new Error(String(rsp[2]))
		if (!rsp[7]) {
			const md5 = await md5Stream(createReadable(thumb, file))
			await highwayUpload.call(
				this.c,
				createReadable(thumb, file),
				{
					cmdid: CmdID.ShortVideo,
					md5,
					size: thumbsize + videosize,
					ext,
					encrypt: true,
				}
			)
		}
		fs.unlink(thumb, NOOP)
		const buf = pb.encode({
			1: rsp[5].toBuffer(),
			2: md5video,
			3: name,
			4: 3,
			5: seconds,
			6: videosize,
			7: width,
			8: height,
			9: md5thumb,
			10: "camera",
			11: thumbsize,
			12: 0,
			15: 1,
			16: width,
			17: height,
			18: 0,
			19: 0,
		})
		return {
			type: "video", file: "protobuf://" + Buffer.from(buf).toString("base64")
		}
	}

	/** 上传一个语音以备发送(理论上传一次所有群和好友都能发) */
	async uploadPtt(elem: PttElem): Promise<PttElem> {
		this.c.logger.debug("开始语音任务")
		if (typeof elem.file === "string" && elem.file.startsWith("protobuf://"))
			return elem
		const buf = await getPttBuffer(elem.file, this.c.config.ffmpeg_path)
		const hash = md5(buf)
		const codec = String(buf.slice(0, 7)).includes("SILK") ? 1 : 0
		const body = pb.encode({
			1: 3,
			2: 3,
			5: {
				1: this.target,
				2: this.c.uin,
				3: 0,
				4: hash,
				5: buf.length,
				6: hash,
				7: 5,
				8: 9,
				9: 4,
				11: 0,
				10: this.c.apk.version,
				12: 1,
				13: 1,
				14: codec,
				15: 1,
			},
		})
		const payload = await this.c.sendUni("PttStore.GroupPttUp", body)
		const rsp = pb.decode(payload)[5]
		rsp[2] && drop(rsp[2], rsp[3])
		const ip = rsp[5]?.[0] || rsp[5], port = rsp[6]?.[0] || rsp[6]
		const ukey = rsp[7].toHex(), filekey = rsp[11].toHex()
		const params = {
			ver: 4679,
			ukey, filekey,
			filesize: buf.length,
			bmd5: hash.toString("hex"),
			mType: "pttDu",
			voice_encodec: codec
		}
		const url = `http://${int32ip2str(ip)}:${port}/?` + querystring.stringify(params)
		const headers = {
			"User-Agent": `QQ/${this.c.apk.version} CFNetwork/1126`,
			"Net-Type": "Wifi"
		}
		await axios.post(url, buf, { headers })
		this.c.logger.debug("语音任务结束")

		const fid = rsp[11].toBuffer()
		const b = pb.encode({
			1: 4,
			2: this.c.uin,
			3: fid,
			4: hash,
			5: hash.toString("hex") + ".amr",
			6: buf.length,
			11: 1,
			18: fid,
			30: Buffer.from([8, 0, 40, 0, 56, 0]),
		})
		return {
			type: "record", file: "protobuf://" + Buffer.from(b).toString("base64")
		}
	}

	private async _uploadMultiMsg(compressed: Buffer) {
		const body = pb.encode({
			1: 1,
			2: 5,
			3: 9,
			4: 3,
			5: this.c.apk.version,
			6: [{
				1: this.target,
				2: compressed.length,
				3: md5(compressed),
				4: 3,
				5: 0,
			}],
			8: 1,
		})
		const payload = await this.c.sendUni("MultiMsg.ApplyUp", body)
		const rsp = pb.decode(payload)[2]
		if (rsp[1] !== 0)
			drop(rsp[1], rsp[2]?.toString() || "unknown MultiMsg.ApplyUp error")
		const buf = pb.encode({
			1: 1,
			2: 5,
			3: 9,
			4: [{
				//1: 3,
				2: this.target,
				4: compressed,
				5: 2,
				6: rsp[3].toBuffer(),
			}],
		})
		const ip = rsp[4]?.[0] || rsp[4], port = rsp[5]?.[0] || rsp[5]
		await highwayUpload.call(this.c, Readable.from(Buffer.from(buf), { objectMode: false }), {
			cmdid: CmdID.MultiMsg,
			md5: md5(buf),
			size: buf.length,
			ticket: rsp[10].toBuffer(),
		}, ip, port)
		return rsp[2].toString() as string
	}

	/** 制作一条合并转发消息以备发送(理论上传一次所有群和好友都能发) */
	async makeForwardMsg(iterable: Forwardable[]): Promise<XmlElem> {
		const nodes = []
		const makers: Converter[] = []
		let imgs: Image[] = []
		let preview = ""
		let cnt = 0
		for (const fake of iterable) {
			const maker = new Converter(fake.message, { dm: this.dm, cachedir: this.c.config.data_dir })
			makers.push(maker)
			const seq = randomBytes(2).readInt16BE()
			const rand = randomBytes(4).readInt32BE()
			let nickname = String(fake.nickname || fake.user_id)
			if (!nickname && fake instanceof PrivateMessage)
				nickname = this.c.fl.get(fake.user_id)?.nickname || this.c.sl.get(fake.user_id)?.nickname || nickname
			if (cnt < 4) {
				cnt++
				preview += `<title color="#777777" size="26">${escapeXml(nickname)}: ${escapeXml(maker.brief.slice(0, 50))}</title>`
			}
			nodes.push({
				1: {
					1: fake.user_id,
					2: this.target,
					3: this.dm ? 166 : 82,
					4: this.dm ? 11 : null,
					5: seq,
					6: fake.time || timestamp(),
					7: rand2uuid(rand),
					9: this.dm ? null : {
						1: this.target,
						4: nickname,
					},
					14: this.dm ? nickname : null,
					20: {
						1: 0,
						2: rand
					}
				},
				3: {
					1: maker.rich
				}
			})
		}
		for (const maker of makers)
			imgs = [ ...imgs, ...maker.imgs ]
		if (imgs.length)
			await this.uploadImages(imgs)
		const compressed = await gzip(pb.encode({
			1: nodes,
			2: {
				1: "MultiMsg",
				2: {
					1: nodes
				}
			}
		}))
		const resid = await this._uploadMultiMsg(compressed)
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<msg brief="[聊天记录]" m_fileName="${uuid().toUpperCase()}" action="viewMultiMsg" tSum="${nodes.length}" flag="3" m_resid="${resid}" serviceID="35" m_fileSize="${compressed.length}"><item layout="1"><title color="#000000" size="34">转发的聊天记录</title>${preview}<hr></hr><summary color="#808080" size="26">查看${nodes.length}条转发消息</summary></item><source name="聊天记录"></source></msg>`
		return {
			type: "xml",
			data: xml,
			id: 35,
		}
	}

	/** 下载并解析合并转发 */
	async getForwardMsg(resid: string) {
		const ret = []
		const buf = await this._downloadMultiMsg(String(resid), 2)
		let a = pb.decode(buf)[2]
		if (Array.isArray(a)) a = a[0]
		a = a[2][1]
		if (!Array.isArray(a)) a = [a]
		for (let proto of a) {
			try {
				ret.push(new ForwardMessage(proto))
			} catch { }
		}
		return ret
	}

	private async _downloadMultiMsg(resid: string, bu: 1 | 2) {
		const body = pb.encode({
			1: 2,
			2: 5,
			3: 9,
			4: 3,
			5: this.c.apk.version,
			7: [{
				1: resid,
				2: 3,
			}],
			8: bu,
			9: 2,
		})
		const payload = await this.c.sendUni("MultiMsg.ApplyDown", body)
		const rsp = pb.decode(payload)[3]
		const ip = int32ip2str(rsp[4]?.[0] || rsp[4])
		const port = rsp[5]?.[0] || rsp[5]
		let url = port == 443 ? "https://ssl.htdata.qq.com" : `http://${ip}:${port}`
		url += rsp[2]
		let { data, headers } = await axios.get(url, { headers: {
			"User-Agent": `QQ/${this.c.apk.version} CFNetwork/1126`,
			"Net-Type": "Wifi"
		}, responseType: "arraybuffer"})
		data = Buffer.from(data as ArrayBuffer)
		let buf = headers["accept-encoding"]?.includes("gzip") ?  await unzip(data as Buffer) : data as Buffer
		const head_len = buf.readUInt32BE(1)
		const body_len = buf.readUInt32BE(5)
		buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), rsp[3].toBuffer())
		return unzip(pb.decode(buf)[3][3].toBuffer())
	}

	/** 获取视频下载地址 */
	async getVideoUrl(fid: string, md5: string | Buffer) {
		const body = pb.encode({
			1: 400,
			4: {
				1: this.c.uin,
				2: this.c.uin,
				3: 1,
				4: 7,
				5: fid,
				6: 1,
				8: md5 instanceof Buffer ? md5 : Buffer.from(md5, "hex"),
				9: 1,
				10: 2,
				11: 2,
				12: 2,
			}
		})
		const payload = await this.c.sendUni("PttCenterSvr.ShortVideoDownReq", body)
		const rsp = pb.decode(payload)[4]
		if (rsp[1] !== 0)
			drop(rsp[1], "获取视频下载地址失败")
		const obj = rsp[9]
		return String(Array.isArray(obj[10]) ? obj[10][0] : obj[10]) + String(obj[11])
	}
}

// 两个文件合并到一个流
function createReadable(file1: string, file2: string) {
	return Readable.from(
		concatStreams(
			fs.createReadStream(file1, { highWaterMark: 256 * 1024 }),
			fs.createReadStream(file2, { highWaterMark: 256 * 1024 })
		)
	)
}

// 合并两个流
async function* concatStreams(readable1: Readable, readable2: Readable) {
	for await (const chunk of readable1)
		yield chunk
	for await (const chunk of readable2)
		yield chunk
}

async function getPttBuffer(file: string | Buffer, ffmpeg = "ffmpeg"): Promise<Buffer> {
	if (file instanceof Buffer || file.startsWith("base64://")) {
		// Buffer或base64
		const buf = file instanceof Buffer ? file : Buffer.from(file.slice(9), "base64")
		const head = buf.slice(0, 7).toString()
		if (head.includes("SILK") || head.includes("AMR")) {
			return buf
		} else {
			const tmpfile = path.join(TMP_DIR, uuid())
			await fs.promises.writeFile(tmpfile, buf)
			return audioTrans(tmpfile, ffmpeg)
		}
	} else if (file.startsWith("http://") || file.startsWith("https://")) {
		// 网络文件
		const readable = (await axios.get(file, { responseType: "stream" })).data as Readable
		const tmpfile = path.join(TMP_DIR, uuid())
		await pipeline(readable.pipe(new DownloadTransform), fs.createWriteStream(tmpfile))
		const head = await read7Bytes(tmpfile)
		if (head.includes("SILK") || head.includes("AMR")) {
			const buf = await fs.promises.readFile(tmpfile)
			fs.unlink(tmpfile, NOOP)
			return buf
		} else {
			return audioTrans(tmpfile, ffmpeg)
		}
	} else {
		// 本地文件
		file = String(file).replace(/^file:\/{2}/, "")
		IS_WIN && file.startsWith("/") && (file = file.slice(1))
		const head = await read7Bytes(file)
		if (head.includes("SILK") || head.includes("AMR")) {
			return fs.promises.readFile(file)
		} else {
			return audioTrans(file, ffmpeg)
		}
	}
}

function audioTrans(file: string, ffmpeg = "ffmpeg"): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const tmpfile = path.join(TMP_DIR, uuid())
		exec(`${ffmpeg} -y -i "${file}" -ac 1 -ar 8000 -f amr "${tmpfile}"`, async (error, stdout, stderr) => {
			try {
				const amr = await fs.promises.readFile(tmpfile)
				resolve(amr)
			} catch {
				reject(new ApiRejection(ErrorCode.FFmpegPttTransError, "音频转码到amr失败，请确认你的ffmpeg可以处理此转换"))
			} finally {
				fs.unlink(tmpfile, NOOP)
			}
		})
	})
}

async function read7Bytes(file: string) {
	const fd = await fs.promises.open(file, "r")
	const buf = (await fd.read(Buffer.alloc(7), 0, 7, 0)).buffer
	fd.close()
	return buf
}
