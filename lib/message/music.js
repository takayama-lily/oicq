/**
 * 构造音乐分享
 */
"use strict";
const { URL } = require("url");
const http = require("http");
const https = require("https");
const pb = require("../pb");

function parse(o) {
    const tag = o.meta.music.tag, data = {};
    if (tag === "QQ音乐") {
        data.type = "qq";
        const url = new URL(o.meta.music.jumpUrl);
        data.id = url.searchParams.get("songid");
    } else if (tag === "网易云音乐") {
        data.type = "163";
        const url = new URL(o.meta.music.musicUrl);
        data.id = url.searchParams.get("id");
    } else {
        throw new Error("unknown music type");
    }
    return data;
}

function fetch(address, options = {}) {
    const url = new URL(address);
    return new Promise((resolve, reject) => {
        const protocol = url.protocol.startsWith("https") ? https : http;
        protocol.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                return reject("url: " + address + "\nstatusCode: " + res.statusCode);
            }
            let data = "";
            res.setEncoding("utf8");
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                resolve(data);
            });
        }).on("error", (err) => {
            reject("url: " + address + "\nerror: " + err.message);
        });
    });
}

async function getQQSongInfo(id) {
    let rsp = await fetch(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&data={"comm":{"ct":24,"cv":0},"songinfo":{"method":"get_song_detail_yqq","param":{"song_type":0,"song_mid":"","song_id":${id}},"module":"music.pf_song_detail_svr"}}`);
    rsp = JSON.parse(rsp).songinfo.data.track_info;
    let mid = rsp.mid, title = rsp.name, album = rsp.album.mid, singer = "unknown";
    try {
        singer = rsp.singer[0].name;
    } catch { }
    rsp = await fetch(`http://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=2034008533&uin=0&format=json&data={"comm":{"ct":23,"cv":0},"url_mid":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey","param":{"guid":"4311206557","songmid":["${mid}"],"songtype":[0],"uin":"0","loginflag":1,"platform":"23"}}}&_=1599039471576`);
    rsp = JSON.parse(rsp).url_mid.data.midurlinfo[0];
    return {
        title: title,
        singer: singer,
        jumpUrl: `https://i.y.qq.com/v8/playsong.html?platform=11&appshare=android_qq&appversion=10030010&hosteuin=oKnlNenz7i-s7c**&songmid=${mid}&type=0&appsongtype=1&_wv=1&source=qq&ADTAG=qfshare`,
        musicUrl: rsp.purl,
        preview: `http://y.gtimg.cn/music/photo_new/T002R180x180M000${album}.jpg`,
    };
}

async function get163SongInfo(id) {
    let rsp = await fetch(`http://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`);
    rsp = JSON.parse(rsp).songs[0];
    return {
        title: rsp.name,
        singer: rsp.artists[0].name,
        jumpUrl: "https://y.music.163.com/m/song/" + id,
        musicUrl: "http://music.163.com/song/media/outer/url?id=" + id,
        preview: rsp.album.picUrl,
    };
}

async function getMiGuSongInfo(id) {
    let rsp = await fetch(`https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?copyrightId=${id}&resourceType=2`);
    rsp = JSON.parse(rsp).resource[0];
    let preview = "";
    try {
        let previewUrl = await fetch(`https://music.migu.cn/v3/api/music/audioPlayer/getSongPic?songId=${rsp.songId}`, { headers: { referer: "https://music.migu.cn/v3/music/player/audio" } });
        preview = JSON.parse(previewUrl).smallPic || "";
    } catch { }
    let getJumpUrl = await fetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/shareInfo.do?contentId=${rsp.contentId}&contentName=${rsp.songName}&resourceType=2&targetUserName=${rsp.singer}`);
    let jumpUrl = JSON.parse(getJumpUrl).url || "http://c.migu.cn/";
    return {
        title: rsp.songName,
        singer: rsp.singer,
        jumpUrl,
        musicUrl: rsp.newRateFormats ? rsp.newRateFormats[0].url.replace(/ftp:\/\/[^/]+/, "https://freetyst.nf.migu.cn") : rsp.rateFormats[0].url.replace(/ftp:\/\/[^/]+/, "https://freetyst.nf.migu.cn"),
        preview,
    };
}

async function getKuGouSongInfo(id) {
    let url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&callback=&hash=${id}&dfid=&mid=${id}&platid=4&_=${+new Date()}&album_id=`;
    let getInfoFirst = await fetch(url);
    getInfoFirst = JSON.parse(getInfoFirst).data;
    url += getInfoFirst.album_id;
    let getInfoSecond = await fetch(url);
    getInfoSecond = JSON.parse(getInfoSecond).data;
    return {
        title: getInfoSecond.audio_name,
        singer: getInfoSecond.author_name,
        jumpUrl: `https://www.kugou.com/song/#hash=${id}&album_id=${getInfoSecond.album_id}`,
        musicUrl: getInfoSecond.play_url || "https://webfs.yun.kugou.com",
        preview: getInfoSecond.img,
    };
}

async function getKuwoSongInfo(id) {
    let getMusicInfo = await fetch(`http://yinyue.kuwo.cn/api/www/music/musicInfo?mid=${id}&httpsStatus=1`, { headers: { csrf: id, Cookie: " kw_token=" + id } });
    let musicInfo = JSON.parse(getMusicInfo).data;
    let getMusicUrl = await fetch(`http://yinyue.kuwo.cn/url?format=mp3&rid=${id}&response=url&type=convert_url3&from=web&t=${+new Date()}`);
    return {
        title: musicInfo.name,
        singer: musicInfo.artist,
        jumpUrl: "http://yinyue.kuwo.cn/play_detail/" + id,
        musicUrl: JSON.parse(getMusicUrl).url || "https://win-web-ra01-sycdn.kuwo.cn",
        preview: musicInfo.pic,
    };
}

async function build(target, type, id, bu) {
    var appid, appname, appsign, style = 4;
    if (type == "qq") {
        appid = 100497308, appname = "com.tencent.qqmusic", appsign = "cbd27cd7c861227d013a25b2d10f0799";
        var { singer, title, jumpUrl, musicUrl, preview } = await getQQSongInfo(id);
        if (!musicUrl)
            style = 0;
    } else if (type == "163") {
        appid = 100495085, appname = "com.netease.cloudmusic", appsign = "da6b069da1e2982db3e386233f68d76d";
        var { singer, title, jumpUrl, musicUrl, preview } = await get163SongInfo(id);
    } else if (type == "migu") {
        appid = 1101053067, appname = "cmccwm.mobilemusic", appsign = "6cdc72a439cef99a3418d2a78aa28c73";
        var { singer, title, jumpUrl, musicUrl, preview } = await getMiGuSongInfo(id);
    } else if (type == "kugou") {
        appid = 205141, appname = "com.kugou.android", appsign = "fe4a24d80fcf253a00676a808f62c2c6";
        var { singer, title, jumpUrl, musicUrl, preview } = await getKuGouSongInfo(id);
    } else if (type == "kuwo") {
        appid = 100243533, appname = "cn.kuwo.player", appsign = "bf9ff4ffb4c558a34ee3fd52c223ebf5";
        var { singer, title, jumpUrl, musicUrl, preview } = await getKuwoSongInfo(id);
    } else {
        throw new Error("unknown music type");
    }

    return pb.encode({
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
    });
}

module.exports = {
    parse, build
};
