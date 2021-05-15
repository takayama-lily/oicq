/**
 * 群文件、离线文件相关
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const pb = require("../pb");
const common = require("../common");
const { highwayUpload } = require("../service");

class GfsError extends Error {
    name = "GfsError";
    constructor(code, message) {
        super(message ? String(message) : "unknown gfs error");
        this.code = code;
    }
}

class Gfs {

    _pwd = "/";

    /**
     * @param {import("../ref").Client} c 
     * @param {number} gid 
     */
    constructor(c, gid) {
        this.c = c;
        this.gid = gid;
    }

    pwd() {
        return this._pwd;
    }
    cd(fid = ".") {
        fid = String(fid);
        if (fid === ".." || fid === "/") {
            this._pwd = "/";
            return;
        }
        if (fid.match(/^\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/))
            this._pwd = fid;
    }

    async df() {
        const body = pb.encode({
            4: {
                1: this.gid,
                2: 3
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d8_3", body);
        const rsp = pb.decode(blob)[4][4];
        const total = rsp[4], used = rsp[5], free = total - used;
        return {
            total, used, free
        };
    }

    async _resolve(fid) {
        const body = pb.encode({
            1: {
                1: this.gid,
                2: 0,
                4: String(fid)
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d8_0", body);
        return pb.decode(blob)[4][1];
    }
    async resolve(fid) {
        const rsp = await this._resolve(fid);
        if (!rsp[1])
            return genGfsFileStat(rsp[4]);
        const err = new GfsError(rsp[1], rsp[2]);
        const files = await this.dir("/");
        for (let file of files) {
            if (file.fid === fid)
                return file;
        }
        throw err;
    }

    async dir(pid = this._pwd) {
        const body = pb.encode({
            2: {
                1: this.gid,
                2: 1,
                3: String(pid)
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d8_1", body);
        const rsp = pb.decode(blob)[4][2];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        const data = [];
        if (!rsp[5])
            return data;
        const files = Array.isArray(rsp[5]) ? rsp[5] : [rsp[5]];
        for (let file of files) {
            if (file[3])
                data.push(genGfsFileStat(file[3]));
            else if (file[2])
                data.push(genGfsFolderStat(file[2]));
        }
        return data;
    }

    async mkdir(name) {
        const body = pb.encode({
            1: {
                1: this.gid,
                2: 0,
                3: "/",
                4: String(name)
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d7_0", body);
        const rsp = pb.decode(blob)[4][1];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        return genGfsFolderStat(rsp[4]);
    }

    /** 删除文件夹会删除下面的所有文件 */
    async rm(fid) {
        const _rsp = await this._resolve(fid);
        if (!_rsp[1]) { //rm file
            const file = genGfsFileStat(_rsp[4]);
            const body = pb.encode({
                4: {
                    1: this.gid,
                    2: 3,
                    3: file.busid,
                    4: file.pid,
                    5: file.fid,
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d6_3", body);
            const rsp = pb.decode(blob)[4][4];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
        } else { //rm dir
            const body = pb.encode({
                2: {
                    1: this.gid,
                    2: 1,
                    3: String(fid)
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d7_1", body);
            const rsp = pb.decode(blob)[4][2];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
        }
    }

    async rename(fid, name) {
        const _rsp = await this._resolve(fid);
        if (!_rsp[1]) { //rename file
            const file = genGfsFileStat(_rsp[4]);
            const body = pb.encode({
                5: {
                    1: this.gid,
                    2: 4,
                    3: file.busid,
                    4: file.fid,
                    5: file.pid,
                    6: String(name)
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d6_4", body);
            const rsp = pb.decode(blob)[4][5];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
        } else { //rename dir
            const body = pb.encode({
                3: {
                    1: this.gid,
                    2: 2,
                    3: String(fid),
                    4: String(name)
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d7_2", body);
            const rsp = pb.decode(blob)[4][3];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
        }
    }

    async mv(fid, pid) {
        const _rsp = await this._resolve(fid);
        if (!_rsp[1]) {
            const file = genGfsFileStat(_rsp[4]);
            const body = pb.encode({
                6: {
                    1: this.gid,
                    2: 5,
                    3: file.busid,
                    4: file.fid,
                    5: file.pid,
                    6: String(pid)
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d6_5", body);
            const rsp = pb.decode(blob)[4][6];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
        } else {
            throw new GfsError(_rsp[1], _rsp[2]);
        }
    }

    async _feed(fid, busid) {
        const body = pb.encode({
            5: {
                1: this.gid,
                2: 4,
                3: {
                    1: busid,
                    2: fid,
                    3: randomBytes(4).readInt32BE(),
                    5: 1,
                }
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d9_4", body);
        let rsp = pb.decode(blob)[4][5];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        rsp = rsp[4];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        rsp = await this._resolve(String(rsp[3]));
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        return genGfsFileStat(rsp[4]);
    }

    async upload(filepath, pid = this._pwd, name) {
        const [md5, sha1] = await common.fileHash(filepath);
        const parsed = path.parse(filepath);
        name = name ? String(name) : (parsed.name + parsed.ext);
        const body = pb.encode({
            1: {
                1: this.gid,
                2: 0,
                3: 102,
                4: 5,
                5: String(pid),
                6: name,
                7: "/storage/emulated/0/Pictures/files/s/" + name,
                8: (await fs.promises.stat(filepath)).size,
                9: sha1,
                11: md5,
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d6_0", body);
        const rsp = pb.decode(blob)[4][1];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        if (!rsp[10]) {
            // todo stream upload
        }
        return await this._feed(String(rsp[7]), rsp[6]);
    }

    async download(fid) {
        const _rsp = await this._resolve(fid);
        if (!_rsp[1]) {
            const file = genGfsFileStat(_rsp[4]);
            const body = pb.encode({
                3: {
                    1: this.gid,
                    2: 2,
                    3: file.busid,
                    4: file.fid,
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d6_2", body);
            const rsp = pb.decode(blob)[4][3];
            if (rsp[1])
                throw new GfsError(rsp[1], rsp[2]);
            return {
                name: file.name,
                url: `http://${rsp[4]}/ftn_handler/${rsp[6].toHex()}/?fname=${file.name}`,
                size: file.size,
                md5: file.md5,
                duration: file.expire_time,
                busid: file.busid,
                fileid: file.fid
            };
        } else {
            throw new GfsError(_rsp[1], _rsp[2]);
        }
    }
}

/**
 * @param {import("../ref").Proto} file 
 */
function genGfsFolderStat(file) {
    return {
        fid: String(file[1]),
        pid: String(file[2]),
        name: String(file[3]),
        create_time: file[4],
        user_id: file[6],
        file_count: file[8] || 0,
        is_folder: true,
    };
}

/**
 * @param {import("../ref").Proto} file 
 */
function genGfsFileStat(file) {
    const data = {
        fid: String(file[1]),
        pid: String(file[16]),
        name: String(file[2]),
        busid: file[4],
        size: file[5],
        md5: file[12].toHex(),
        sha1: file[10].toHex(),
        create_time: file[6],
        expire_time: file[7],
        user_id: file[15],
        download_times: file[9],
    };
    if (!data.fid.startsWith("/"))
        data.fid = "/" + data.fid;
    return data;
}

/**
 * @this {import("../ref").Client}
 * @param {Buffer|string} fileid 
 */
async function getC2CFileUrl(fileid) {
    const body = pb.encode({
        1: 1200,
        14: {
            10: this.uin,
            20: fileid,
            30: 2
        },
        101: 3,
        102: 104,
        99999: {
            1: 90200
        }
    });
    const blob = await this.sendUni("OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_DOWNLOAD-1200", body);
    const rsp = pb.decode(blob)[14][30];
    let url = String(rsp[50]);
    if (!url.startsWith("http"))
        url = `http://${rsp[30]}:${rsp[40]}` + url;
    return url;
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").Proto} elem 
 */
async function getVideoUrl(elem) {
    const body = pb.encode({
        1: 400,
        4: {
            1: this.uin,
            2: this.uin,
            3: 1,
            4: 7,
            5: elem[1],
            6: 1,
            8: elem[2],
            9: 1,
            10: 2,
            11: 2,
            12: 2,
        }
    });
    const blob = await this.sendUni("PttCenterSvr.ShortVideoDownReq", body);
    const rsp = pb.decode(blob)[4][9];
    return String(rsp[10]) + String(rsp[11]);
}

module.exports = {
    getC2CFileUrl, getVideoUrl, Gfs
};
