
import fs from "fs"
import path from "path"
import { gzipSync } from "zlib"
import { Readable } from "stream"
import { randomBytes } from "crypto"
import { exec } from "child_process"
import { pb, ApiRejection } from "../core"
import { ErrorCode, drop } from "../errors"
import { escapeXml, md5, NOOP, timestamp, uuid, md5Stream, IS_WIN, log } from "../common"
import { Sendable, PrivateMessage, MessageElem, Forwardable, Image, ImageElem, VideoElem, PttElem, Converter, XmlElem, rand2uuid } from "../message"
import { CmdID, highwayUpload } from "./highway"

type Client = import("../client").Client

/** 优雅接口背后必有龌龊实现 */
export class ShitMountain {

	protected uid?: number
	protected gid?: number

	private get uin() {
		return this.uid || this.gid || this.c.uin
	}
	private get dm() {
		return !!this.uid
	}

	protected constructor(protected readonly c: Client) { }

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
			2: req
		})
		const payload = await this.c.sendUni("LongConn.OffPicUp", body)
		return pb.decode(payload)[2] as pb.Proto | pb.Proto[]
	}

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

	/** 上传一批图片以备发送 */
	async uploadImages(imgs: Image[]) {
		const tasks = []
		for (const img of imgs)
			tasks.push(img.task)
		await Promise.allSettled(tasks)
		let n = 0
		let results: PromiseSettledResult<void>[] = []
		while (imgs.length > n) {
			this.c.logger.debug("开始请求上传图片到tx服务器")
			let rsp = await (this.dm ? this._offPicUp : this._groupPicUp)(imgs.slice(n, n + 20))
			!Array.isArray(rsp) && (rsp = [rsp])
			const tasks = []
			for (let i = n; i < imgs.length; ++i) {
				if (i >= n + 20) break
				tasks.push(this._imageShit(imgs[i], rsp[i%20]))
			}
			results = [ ...results, ...await Promise.allSettled(tasks)]
			this.c.logger.debug("请求图片上传结束")
			n += 20
		}
		return results
	}

	private async _imageShit(img: Image, rsp: pb.Proto) {
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

	protected async _preprocess(content: Sendable) {
		try {
			if (!Array.isArray(content))
				content = [content]
			if ((content[0] as MessageElem).type === "video")
				content[0] = await this.uploadVideo(content[0] as VideoElem)
			else if ((content[0] as MessageElem).type === "record")
				content[0] = await this.uploadPtt(content[0] as PttElem)
			const converter = await Converter.from(content, {
				dm: this.dm,
				cachedir: path.join(this.c.dir, "../image"),
				mlist: this.c.gml.get(this.gid!)
			})
			await this.uploadImages(converter.imgs)
			return converter
		} catch (e: any) {
			drop(ErrorCode.MessageBuildingFailure, e.message)
		}
	}

	/** 上传一个视频以备发送 */
	async uploadVideo(elem: VideoElem): Promise<VideoElem> {
		let { file } = elem
		if (file.startsWith("protobuf://")) return elem
		file = file.replace(/^file:\/{2}/, "")
		IS_WIN && file.startsWith("/") && (file = file.slice(1))
		const thumb = path.join(this.c.dir, "../image", uuid())
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
				this.c.logger.debug("ffprobe output: " + stdout + stderr)
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
			2: this.uin,
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
			6: this.uin,
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

	/** 上传一个语音以备发送 */
	async uploadPtt(elem: PttElem): Promise<PttElem> {
		// todo
		return elem
	}

	private async _uploadMultiMsg(compressed: Buffer) {
		const body = pb.encode({
			1: 1,
			2: 5,
			3: 9,
			4: 3,
			5: this.c.apk.version,
			6: [{
				1: this.uin,
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
				2: this.uin,
				4: compressed,
				5: 2,
				6: rsp[3].toBuffer(),
			}],
		})
		const ip = Array.isArray(rsp[4]) ? rsp[4][0] : rsp[4],
			port = Array.isArray(rsp[5]) ? rsp[5][0] : rsp[5]
		await highwayUpload.call(this.c, Readable.from(Buffer.from(buf), { objectMode: false }), {
			cmdid: CmdID.MultiMsg,
			md5: md5(buf),
			size: buf.length,
			ticket: rsp[10].toBuffer(),
		}, ip, port)
		return rsp[2].toString() as string
	}

	/** 制作一条xml转发消息 */
	async makeForwardMessage(iterable: Forwardable[]): Promise<XmlElem> {
		const nodes = []
		const makers: Converter[] = []
		let imgs: Image[] = []
		let tasks: Promise<void>[] = []
		let preview = ""
		let cnt = 0
		for (const fake of iterable) {
			const maker = new Converter(fake.message, { dm: this.dm, cachedir: this.c.config.data_dir })
			makers.push(maker)
			tasks = [ ...tasks, ...maker.tasks ]
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
					2: this.uin,
					3: this.dm ? 166 : 82,
					4: this.dm ? 11 : null,
					5: seq,
					6: fake.time || timestamp(),
					7: rand2uuid(rand),
					9: this.dm ? null : {
						1: this.uin,
						4: nickname,
					},
					14: nickname,
					20: {
						2: 1
					}
				},
				3: {
					1: maker.rich
				}
			})
		}
		await Promise.allSettled(tasks).catch(NOOP)
		for (const maker of makers) {
			imgs = [ ...imgs, ...maker.imgs ]
		}
		await this.uploadImages(imgs)
		const compressed = gzipSync(pb.encode({
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
}

function createReadable(file1: string, file2: string) {
	return Readable.from(
		concatStreams(
			fs.createReadStream(file1, { highWaterMark: 256 * 1024 }),
			fs.createReadStream(file2, { highWaterMark: 256 * 1024 })
		)
	)
}
async function* concatStreams(readable1: Readable, readable2: Readable) {
	for await (const chunk of readable1)
		yield chunk
	for await (const chunk of readable2)
		yield chunk
}
