import { Socket } from "net"
import axios from "axios"
import { BUF0, NOOP, timestamp } from "./constants"
import * as jce from "./jce"
import * as tea from "./tea"

const default_host = "msfwifi.3g.qq.com"
const default_port = 8080
let update_time = 0
let searching: Promise<void> | undefined
let host_port: {[ip: string]: number} = { }

/**
 * @event connect2
 * @event packet
 * @event lost
 */
export default class Network extends Socket {

	host = default_host
	port = default_port
	auto_search = true
	connected = false
	private buf = BUF0

	constructor() {
		super()
		this.on("close", () => {
			this.buf = BUF0
			if (this.connected) {
				this.connected = false
				delete host_port[this.host]
				this.resolve()
				this.emit("lost")
			}
		})

		this.on("data", (chunk) => {
			this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk])
			while (this.buf.length > 4) {
				let len = this.buf.readUInt32BE()
				if (this.buf.length >= len) {
					const packet = this.buf.slice(4, len)
					this.buf = this.buf.slice(len)
					this.emit("packet", packet)
				} else {
					break
				}
			}
		})
	}

	join(cb = NOOP) {
		if (this.connecting) return
		if (this.connected) return cb()
		this.removeAllListeners("connect")
		this.connect(this.port, this.host, () => {
			this.connected = true
			this.emit("connect2")
			cb()
		})
		this.resolve()
	}

	private resolve() {
		if (!this.auto_search) return
		const iplist = Object.keys(host_port)
		if (iplist.length > 0) {
			this.host = iplist[0]
			this.port = host_port[this.host]
		}
		if (timestamp() - update_time >= 3600 && !searching) {
			searching = fetchServerList().then(map => {
				searching = undefined
				const list = Object.keys(map).slice(0, 3)
				if (list[0] && list[1]) {
					update_time = timestamp()
					host_port = { }
					host_port[list[0]] = map[list[0]]
					host_port[list[1]] = map[list[1]]
				}
			}).catch(NOOP)
		}
	}
}

/** 通常来说只有前两个ip比较稳定，后面的可能距离较远 */
export async function fetchServerList() {
	const key = Buffer.from("F0441F5FF42DA58FDCF7949ABA62D411", "hex")
	const HttpServerListReq = jce.encodeStruct([
		null,
		0, 0, 1, "00000", 100, 537064989, "356235088634151", 0, 0, 0,
		0, 0, 0, 1
	])
	let body = jce.encodeWrapper({ HttpServerListReq }, "ConfigHttp", "HttpServerListReq")
	const len = Buffer.alloc(4)
	len.writeUInt32BE(body.length + 4)
	body = Buffer.concat([len, body])
	body = tea.encrypt(body, key)
	const { data } = await axios.post("https://configsvr.msf.3g.qq.com/configsvr/serverlist.jsp?mType=getssolist", body, { timeout: 10000, responseType: "arraybuffer" })
	let buf = Buffer.from(data as ArrayBuffer)
	buf = tea.decrypt(buf, key).slice(4)
	const nested = jce.decodeWrapper(buf)
	const map: typeof host_port = { }
	for (let v of nested[2])
		map[v[1]] = v[2]
	return map
}
