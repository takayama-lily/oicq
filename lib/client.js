"use strict"
const Events = require("events")
const dns = require('dns')
const net = require("net")
const common = require("./common")

//tx服务器
const server_list = [
    {ip:"42.81.169.46",port:8080},
    {ip:"42.81.172.81",port:80},
    {ip:"42.81.172.147",port:443},
    {ip:"42.81.172.22",port:80},
    {ip:"114.221.148.59",port:14000},
    {ip:"114.221.144.215",port:80},
    {ip:"125.94.60.146",port:80}
]
const lookupDns = async()=>{
    try {
        const {address} = await dns.promises.lookup("msfwifi.3g.qq.com")
        server_list.push({ip:address, port:8080})
    } catch (e) {}
}

//ping测试
const testServers = ()=>{}
setInterval(testServers, 600000)

//初始化
const init = async()=>{
    await lookupDns()
    testServers()
}

//qq客户端
class Client extends net.Socket {

    static OFFLINE = Symbol("OFFLINE")
    static CONNECTING = Symbol("CONNECTING")
    static INIT = Symbol("INIT")
    static ONLINE = Symbol("ONLINE")

    ip = ""
    port = 8080
    timeout = 3000

    status = Client.OFFLINE

    uin = 0
    password_md5 = Buffer.alloc(16)

    nickname = ""
    age = 0
    gender = 0

    friend_list = []
    group_list = []

    heartbeat = null
    seq_id = 0
    headlers = {}
    session_id = Buffer.alloc(0)
    random_key = Buffer.alloc(0)

    constructor(uin, password, config = {}) {
        super()
        this.uin = uin
        this.password_md5 = common.md5(password)

        this.on("error", (err)=>{
            console.log(err.message)
        })
        this.on("close", ()=>{
            console.log(`${this.ip}:${this.port} closed`)
            this.stopHeartbeat()
        })
        this.on("connect", ()=>{
            console.log(`${this.ip}:${this.port} connected`)
        })
        // this.on("ready", err=>console.log("ready"))
        this.on("data", ()=>{

        })
    }

    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1
    }

    async send(data) {
        const seq_id = this.seq_id
        return new Promise((resolve, reject)=>{
            this.headlers[seq_id] = resolve
            setTimeout(()=>{
                delete this.headlers[seq_id]
                reject()
            }, this.timeout)
        })
    }

    async login() {
        const {ip, port} = server_list[0]
        this.ip = ip, this.port = port
        console.log(`connecting to ${ip}:${port}`)
        this.connect(port, ip)
        const res = await this.send(buildLoginPacket())
    }

    startHeartbeat() {
        setInterval(()=>{
            this.write(buildHeartbeatPacket())
        }, 30000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat)
    }
}
const a = new Client(123, "112233")
a.login()
