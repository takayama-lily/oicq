/**
 * 群文件、离线文件相关
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const pb = require("../algo/pb");
const common = require("../common");
const { highwayUploadStream } = require("../service");
const { Readable } = require("stream");

class GfsError extends Error {
    name = "GfsError";
    constructor(code, message) {
        super(message ? String(message) : "unknown gfs error");
        this.code = code;
    }
}

class Gfs {

    /**
     * @param {import("../ref").Client} c 
     * @param {number} gid 
     */
    constructor(c, gid) {
        this.c = c;
        this.gid = gid;
    }

    async df() {
        const [a, b] = await Promise.all([(async()=>{
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
        })(),
        (async()=>{
            const body = pb.encode({
                3: {
                    1: this.gid,
                    2: 2
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d8_2", body);
            const rsp = pb.decode(blob)[4][3];
            const file_count = rsp[4], max_file_count = rsp[6];
            return {
                file_count, max_file_count
            };
        })()]);
        return Object.assign(a, b);
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
        const rsp = pb.decode(blob)[4][1];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        return genGfsFileStat(rsp[4]);
    }
    async stat(fid) {
        try {
            return await this._resolve(fid);
        } catch (e) {
            const files = await this.dir("/");
            for (let file of files) {
                if (!file.is_dir)
                    break;
                if (file.fid === fid)
                    return file;
            }
            throw e;
        }
    }

    ls(pid = "/", start = 0, limit = 100) {
        return this.dir(pid, start, limit);
    }
    async dir(pid = "/", start = 0, limit = 100) {
        const body = pb.encode({
            2: {
                1: this.gid,
                2: 1,
                3: String(pid),
                5: Number(limit) || 100,
                13: Number(start) || 0
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
                data.push(genGfsDirStat(file[2]));
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
        return genGfsDirStat(rsp[4]);
    }

    /** 删除目录会删除下面的所有文件 */
    async rm(fid) {
        fid = String(fid);
        let rsp;
        if (!fid.startsWith("/")) { //rm file
            const file = await this._resolve(fid);
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
            rsp = pb.decode(blob)[4][4];
        } else { //rm dir
            const body = pb.encode({
                2: {
                    1: this.gid,
                    2: 1,
                    3: String(fid)
                }
            });
            const blob = await this.c.sendOidb("OidbSvc.0x6d7_1", body);
            rsp = pb.decode(blob)[4][2];
        }
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
    }

    async rename(fid, name) {
        fid = String(fid);
        let rsp;
        if (!fid.startsWith("/")) { //rename file
            const file = await this._resolve(fid);
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
            rsp = pb.decode(blob)[4][5];
            
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
            rsp = pb.decode(blob)[4][3];
        }
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
    }

    async mv(fid, pid) {
        const file = await this._resolve(fid);
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
        return await this._resolve(rsp[3]);
    }

    async upload(file, pid = "/", name, callback) {
        let size, md5, sha1;
        if (file instanceof Uint8Array || file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
            if (!Buffer.isBuffer(file))
                file = Buffer.from(file);
            size = file.length;
            md5 = common.md5(file), sha1 = common.sha1(file);
            name = name ? String(name) : ("file" + md5.toString("hex"));
        } else {
            file = String(file);
            size = (await fs.promises.stat(file)).size;
            [md5, sha1] = await common.fileHash(file);
            name = name ? String(name) : path.basename(file);
        }
        const body = pb.encode({
            1: {
                1: this.gid,
                2: 0,
                3: 102,
                4: 5,
                5: String(pid),
                6: name,
                7: "/storage/emulated/0/Pictures/files/s/" + name,
                8: size,
                9: sha1,
                11: md5,
                15: 1,
            }
        });
        const blob = await this.c.sendOidb("OidbSvc.0x6d6_0", body);
        const rsp = pb.decode(blob)[4][1];
        if (rsp[1])
            throw new GfsError(rsp[1], rsp[2]);
        if (!rsp[10]) {
            if (!this.c.storage.sig_session)
                throw new GfsError(-1, "登录后无法立即上传文件，请等待几秒");
            const ext = pb.encode({
                1: 100,
                2: 1,
                3: 0,
                100: {
                    100: {
                        1: rsp[6],
                        100: this.c.uin,
                        200: this.gid,
                        400: this.gid,
                    },
                    200: {
                        100: size,
                        200: md5,
                        300: sha1,
                        600: rsp[7],
                        700: rsp[9],
                    },
                    300: {
                        100: 2,
                        200: String(this.c.apk.subid),
                        300: 2,
                        400: "9e9c09dc",
                        600: 4,
                    },
                    400: {
                        100: name,
                    },
                    500: {
                        200: {
                            1: {
                                1: 1,
                                2: rsp[12]
                            },
                            2: rsp[14]
                        }
                    },
                }
            });
            await highwayUploadStream.call(
                this.c,
                Buffer.isBuffer(file) ? Readable.from(file, { objectMode: false }) : fs.createReadStream(String(file), { highWaterMark: 1024 * 256 }),
                {
                    cmd: 71, callback,
                    md5, size, ext
                }
            );
        }
        return await this._feed(String(rsp[7]), rsp[6]);
    }

    async download(fid) {
        const file = await this._resolve(fid);
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
            fileid: file.fid,
            fid: file.fid,
        };
    }
}

/**
 * @param {import("../ref").Proto} file 
 */
function genGfsDirStat(file) {
    return {
        fid: String(file[1]),
        pid: String(file[2]),
        name: String(file[3]),
        create_time: file[4],
        user_id: file[6],
        file_count: file[8] || 0,
        is_dir: true,
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
        duration: file[7],
        user_id: file[15],
        download_times: file[9],
    };
    if (data.fid.startsWith("/"))
        data.fid = data.fid.slice(1);
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

module.exports = {
    getC2CFileUrl, Gfs
};
