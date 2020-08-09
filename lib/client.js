"use strict"
const dns = require("dns")
const net = require("net")
const path = require("path")
const ping = require("ping")
const log4js = require("log4js")
const common = require("./common")
const builder = require("./packet/builder")
const parser = require("./packet/parser")

const logger = log4js.getLogger("[SYSTEM]")
logger.level = "trace" //发布时改为info

//tx服务器
const server_list = [
    {ip:"42.81.169.46",port:8080,ping:null},
    {ip:"42.81.172.81",port:80,ping:null},
    {ip:"42.81.172.147",port:443,ping:null},
    {ip:"42.81.172.22",port:80,ping:null},
    {ip:"114.221.148.59",port:14000,ping:null},
    {ip:"114.221.144.215",port:80,ping:null},
    {ip:"125.94.60.146",port:80,ping:null}
]
//测定所有服务器的ping 按优劣排序
const testServers = async()=>{
    const tests = []
    for (let v of server_list) {
        tests.push(ping.promise.probe(v.ip, {extra: ['-n', '4']}).then((p)=>{
            delete p.output
            server_list.find((o)=>v.ip===o.ip).ping = p
            server_list.sort((a, b)=>{
                if (!b.ping) return -1
                if (!a.ping) return 1
                if (!b.ping.alive) return -1
                if (parseFloat(b.ping.packetLoss) > parseFloat(a.ping.packetLoss)) return -1
                if (parseFloat(a.ping.packetLoss) > parseFloat(b.ping.packetLoss)) return 1
                if (b.ping.time > a.ping.time) return -1
                return 0
            })
        }))
    }
    await Promise.all(tests)
    logger.info("servers tested, the best server is " + server_list[0].ip)
}

// -------------------------------------------------------------------------------------------------------------

//qq客户端
class Client extends net.Socket {

    static OFFLINE = Symbol("OFFLINE")
    static CONNECTING = Symbol("CONNECTING")
    static INIT = Symbol("INIT")
    static ONLINE = Symbol("ONLINE")

    timeout = 3000 //回包等待超时
    status = Client.OFFLINE
    logger = null

    uin = 0
    password_md5 = Buffer.alloc(16)

    nickname = ""
    age = 0
    gender = 0

    friend_list = []
    group_list = []

    heartbeat = null
    seq_id = 0x3635
    handlers = {}

    session_id = Buffer.from([0x02, 0xB0, 0x5B, 0x8B])
    random_key = Buffer.alloc(16)
    ksid = Buffer.from("|454001228437590|A8.2.7.27f6ea96")
    sig_info = {
        bitmap: undefined,
        tgt: undefined,
        tgt_key: undefined,
        st_key: undefined,
        st_web_sig: undefined,
        s_key: undefined,
        d2: undefined,
        d2key: undefined,
        ticket_key: undefined,
        device_token: undefined,
    }

    constructor(uin, password, config = {}) {
        super()
        const default_config = {
            log_level: "info",
            device_file_path: path.join(process.mainModule.path, "devices")
        }
        config = {
            ...default_config,
            ...config
        }
        this.logger = log4js.getLogger(`[BOT:${uin}]`)
        this.logger.level = "debug"
        this.uin = uin
        this.password_md5 = common.md5(password)

        this.on("error", (err)=>{
            this.logger.error(err.message)
        })
        this.on("close", ()=>{
            this.logger.warn(`${this.remoteAddress}:${this.remotePort} closed`)
            this.stopHeartbeat()
            this.login()
        })
        // this.on("connect", ()=>{})
        // this.on("ready", err=>console.log("ready"))
        this.on("data", (data)=>{
            this.logger.trace("recv: " + data)
            parser.exec(data)
        })
        this.on("login", async()=>{
            if (!this.friend_list.length && !this.group_list.length) {
                this.status = Client.INIT
                await Promise.all([
                    this.getFriendList(), this.getGroupList()
                ])
            }
            this.status = Client.ONLINE
        })
    }

    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1
    }

    async send(data) {
        this.logger.trace("send: " + data)
        const seq_id = this.seq_id
        return new Promise((resolve, reject)=>{
            this.handlers[seq_id] = resolve
            setTimeout(()=>{
                delete this.handlers[seq_id]
                reject()
            }, this.timeout)
        })
    }

    login() {
        const {ip, port} = server_list[0]
        this.status = Client.CONNECTING
        this.logger.info(`connecting to ${ip}:${port}`)
        this.connect(port, ip, async()=>{
            this.logger.info(`${this.remoteAddress}:${this.remotePort} connected`)
            // const res = await this.send(builder.exec("login"))
            // this.startHeartbeat()
        })
    }

    async getFriendList() {
        this.friend_list = []
        return this.friend_list
    }
    async getGroupList() {
        this.group_list = []
        return this.group_list
    }

    startHeartbeat() {
        this.heartbeat = setInterval(()=>{
            this.write(builder.exec("heartbeat"))
        }, 30000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat)
    }
}

// -------------------------------------------------------------------------------------------------------------

Client.init = async()=>{
    try {
        const {address} = await dns.promises.lookup("msfwifi.3g.qq.com")
        server_list.push({ip:address, port:8080, ping:null})
    } catch (e) {}
    logger.info("testing servers...")
    setInterval(testServers, 1800000)
    await testServers()
}

module.exports = Client

async function test() {
    await Client.init()
    const a = new Client(123, "112233")
    a.login()
}
test()
