"use strict"
try {
	var { createClient, core } = require("../lib")
} catch {
	var { createClient, core } = require("oicq")
}
const jce = core.jce

const client = createClient(147258369)
client.login()

client.on("system.online", async function () {
	const FSOLREQ = jce.encodeStruct([
		this.uin, 0, 0, null, 1, 31, 0
	])
	const body = jce.encodeWrapper({ FSOLREQ }, "mqq.IMService.FriendListServiceServantObj", "GetSimpleOnlineFriendInfoReq")
	const payload = await this.sendUni("friendlist.GetSimpleOnlineFriendInfoReq", body)
	const rsp = jce.decodeWrapper(payload)[1]
	console.log("我的好友在线状态:", rsp)
})
