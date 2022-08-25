import axios from "axios"

async function getQQSong(id: string) {
	let rsp: any = await axios.get(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&data={"comm":{"ct":24,"cv":0},"songinfo":{"method":"get_song_detail_yqq","param":{"song_type":0,"song_mid":"","song_id":${id}},"module":"music.pf_song_detail_svr"}}`, { responseType: "json" })
	rsp = rsp.data.songinfo.data.track_info
	let mid = rsp.mid, title = rsp.name, album = rsp.album.mid, singer = rsp.singer?.[0]?.name || "unknown"
	rsp = await axios.get(`http://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=2034008533&uin=0&format=json&data={"comm":{"ct":23,"cv":0},"url_mid":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey","param":{"guid":"4311206557","songmid":["${mid}"],"songtype":[0],"uin":"0","loginflag":1,"platform":"23"}}}&_=1599039471576`, { responseType: "json" })
	rsp = rsp.data.url_mid.data.midurlinfo[0]
	return {
		title: title,
		singer: singer,
		jumpUrl: `https://i.y.qq.com/v8/playsong.html?platform=11&appshare=android_qq&appversion=10030010&hosteuin=oKnlNenz7i-s7c**&songmid=${mid}&type=0&appsongtype=1&_wv=1&source=qq&ADTAG=qfshare`,
		musicUrl: rsp.purl,
		preview: `http://y.gtimg.cn/music/photo_new/T002R180x180M000${album}.jpg`,
	} as any
}

async function get163Song(id: string) {
	let rsp: any = await axios.get(`http://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`, { responseType: "json" })
	rsp = rsp.data.songs[0]
	return {
		title: rsp.name,
		singer: rsp.artists[0].name,
		jumpUrl: "https://y.music.163.com/m/song/" + id,
		musicUrl: "http://music.163.com/song/media/outer/url?id=" + id,
		preview: rsp.album.picUrl,
	} as any
}

async function getMiGuSong(id: string) {
	let rsp: any = await axios.get(`https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?copyrightId=${id}&resourceType=2`, { responseType: "json" })
	rsp = rsp.data.resource[0]
	let preview = ""
	try {
		let a: any = await axios.get(`https://music.migu.cn/v3/api/music/audioPlayer/getSongPic?songId=${rsp.songId}`, { responseType: "json", headers: { referer: "https://music.migu.cn/v3/music/player/audio" } })
		preview = a.data.smallPic || ""
	} catch { }
	let url: any = await axios.get(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/shareInfo.do?contentId=${rsp.contentId}&contentName=${encodeURIComponent(rsp.songName)}&resourceType=2&targetUserName=${encodeURIComponent(rsp.singer)}`, { responseType: "json" })
	let jumpUrl = url.data.url || "http://c.migu.cn/"
	return {
		title: rsp.songName,
		singer: rsp.singer,
		jumpUrl,
		musicUrl: rsp.newRateFormats ? rsp.newRateFormats[0].url.replace(/ftp:\/\/[^/]+/, "https://freetyst.nf.migu.cn") : rsp.rateFormats[0].url.replace(/ftp:\/\/[^/]+/, "https://freetyst.nf.migu.cn"),
		preview: preview || "",
	} as any
}

async function getKuGouSong(id: string) {
	let url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&callback=&hash=${id}&dfid=&mid=${id}&platid=4&_=${+new Date()}&album_id=`
	let rsp: any = await axios.get(url, { responseType: "json" })
	rsp = rsp.data.data
	url += rsp.album_id
	rsp = await axios.get(url, { responseType: "json" })
	rsp = rsp.data.data
	return {
		title: rsp.audio_name,
		singer: rsp.author_name,
		jumpUrl: `https://www.kugou.com/song/#hash=${id}&album_id=${rsp.album_id}`,
		musicUrl: rsp.play_url || "https://webfs.yun.kugou.com",
		preview: rsp.img,
	} as any
}

async function getKuwoSong(id: string) {
	let rsp: any = await axios.get(`http://yinyue.kuwo.cn/api/www/music/musicInfo?mid=${id}&httpsStatus=1`, { responseType: "json", headers: { csrf: id, cookie: " kw_token=" + id } })
	rsp = rsp.data.data
	// let url: any = await axios.get(`http://yinyue.kuwo.cn/url?format=mp3&rid=${id}&response=url&type=convert_url3&from=web&t=${+new Date()}`, { responseType: "json" })
	let url: any = await axios.get(`http://www.kuwo.cn/api/v1/www/music/playUrl?mid=${id}&type=music&httpsStatus=1`)
	return {
		title: rsp.name,
		singer: rsp.artist,
		jumpUrl: "http://yinyue.kuwo.cn/play_detail/" + id,
		musicUrl: url.data.data.url || "https://win-web-ra01-sycdn.kuwo.cn",
		preview: rsp.pic,
	} as any
}

/** 支持的音乐平台 */
export type MusicPlatform = "qq" | "163" | "migu" | "kugou" | "kuwo"

/** 构造b77音乐分享 */
export async function buildMusic(target: number, platform: MusicPlatform, id: string, bu: number) {
	var appid, appname, appsign, style = 4
	try {
		if (platform == "qq") {
			appid = 100497308, appname = "com.tencent.qqmusic", appsign = "cbd27cd7c861227d013a25b2d10f0799"
			var { singer, title, jumpUrl, musicUrl, preview } = await getQQSong(id)
			if (!musicUrl)
				style = 0
		} else if (platform == "163") {
			appid = 100495085, appname = "com.netease.cloudmusic", appsign = "da6b069da1e2982db3e386233f68d76d"
			var { singer, title, jumpUrl, musicUrl, preview } = await get163Song(id)
		} else if (platform == "migu") {
			appid = 1101053067, appname = "cmccwm.mobilemusic", appsign = "6cdc72a439cef99a3418d2a78aa28c73"
			var { singer, title, jumpUrl, musicUrl, preview } = await getMiGuSong(id)
		} else if (platform == "kugou") {
			appid = 205141, appname = "com.kugou.android", appsign = "fe4a24d80fcf253a00676a808f62c2c6"
			var { singer, title, jumpUrl, musicUrl, preview } = await getKuGouSong(id)
		} else if (platform == "kuwo") {
			appid = 100243533, appname = "cn.kuwo.player", appsign = "bf9ff4ffb4c558a34ee3fd52c223ebf5"
			var { singer, title, jumpUrl, musicUrl, preview } = await getKuwoSong(id)
		} else {
			throw new Error("unknown music platform: " + platform)
		}
	} catch (e) {
		throw new Error("unknown music id: " + id + ", in platform: " + platform)
	}

	return {
		1: appid,
		2: 1,
		3: style,
		5: {
			1: 1,
			2: "0.0.0",
			3: appname,
			4: appsign
		},
		10: bu,
		11: target,
		12: {
			10: title,
			11: singer,
			12: "[分享]" + title,
			13: jumpUrl,
			14: preview,
			16: musicUrl,
		}
	}
}
