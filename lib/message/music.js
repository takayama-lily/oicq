"use strict";
const {URL} = require("url");
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

async function qwerty(url) {
    return new Promise((resolve, reject)=>{
        const protocol = url.startsWith("https") ? https : http;
        protocol.get(url, (res)=>{
            let data = "";
            res.setEncoding("utf8");
            res.on("data", chunk=>data+=chunk);
            res.on("end", ()=>{
                resolve(data);
            });
        }).on("error", reject);
    })
}

async function getQQSongInfo(id) {
    let rsp = await qwerty(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&data={"comm":{"ct":24,"cv":0},"songinfo":{"method":"get_song_detail_yqq","param":{"song_type":0,"song_mid":"","song_id":${id}},"module":"music.pf_song_detail_svr"}}`);
    rsp = JSON.parse(rsp).songinfo.data.track_info;
    let mid = rsp.mid, title = rsp.name, album = rsp.album.mid, singer = "unknown";
    try {
        singer = rsp.singer[0].name;
    } catch {}
    rsp = await qwerty(`http://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=2034008533&uin=0&format=json&data={"comm":{"ct":23,"cv":0},"url_mid":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey","param":{"guid":"4311206557","songmid":["${mid}"],"songtype":[0],"uin":"0","loginflag":1,"platform":"23"}}}&_=1599039471576`);
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
    let rsp = await qwerty(`http://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`);
    rsp = JSON.parse(rsp).songs[0];
    return {
        title: rsp.name,
        singer: rsp.artists[0].name,
        jumpUrl: `https://y.music.163.com/m/song/` + id,
        musicUrl: `http://music.163.com/song/media/outer/url?id=` + id,
        preview: rsp.artists[0].picUrl,
    };
}

async function build(target, type, id, bu) {
    var appid, appname, appsign, style = 4;
    if (type == "qq") {
        appid = 100497308, appname = "com.tencent.qqmusic", appsign = "cbd27cd7c861227d013a25b2d10f0799";
        var {singer, title, jumpUrl, musicUrl, preview} = await getQQSongInfo(id);
        if (!musicUrl)
            style = 0;
    } else if (type == "163") {
        appid = 100495085, appname = "com.netease.cloudmusic", appsign = "da6b069da1e2982db3e386233f68d76d";
        var {singer, title, jumpUrl, musicUrl, preview} = await get163SongInfo(id);
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
            12: title,
            13: jumpUrl,
            14: preview,
            16: musicUrl,
        }
    });
}

module.exports = {
    parse, build
};
