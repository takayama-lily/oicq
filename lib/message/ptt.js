/**
 * 构造语音节点
 * 上传语音
 * 音频转换
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const querystring = require("querystring");
const { exec } = require("child_process");
const pb = require("../algo/pb");
const { downloadFromWeb, int32ip2str } = require("../service");
const common = require("../common");

const ERROR_UNSUPPORTED_FILE = new Error("file必须为Buffer或string类型");
const ERROR_FFMPEG_FAILED = new Error("音频转码到amr失败，请确认你的ffmpeg可以处理此转换");

/**
 * 语音处理流程
 * 
 *               no↗ transform -> cachefile ↘
 * localfile -> amr|slk?     -> yes ->         Buffer -> upload
 * 
 * base64file
 *    ↓       no↗ tmpfile -> transform -> cachefile -> Buffer -> upload -> delete tmpfile
 * Buffer -> amr|slk? -> yes -> upload
 * 
 * httpfile -> tmpfile -> amr|slk? -> yes -> mv tmpfile cachefile       -> Buffer -> upload
 *                         no↘ transform -> cachefile -> delete tmpfile ↗
 * 
 * @this {import("../ref").Client}
 * @param {number} target
 * @param {import("../ref").ImgPttElem["data"]} cq 
 * @returns {Promise<Buffer>}
 */
async function makePttElem(target, cq) {
    let { file, cache, timeout, headers } = cq;

    if (!file)
        throw ERROR_UNSUPPORTED_FILE;

    // 转发收到的语音
    if (file.startsWith && file.startsWith("protobuf://")) {
        return Buffer.from(file.slice(11), "base64");
    }

    // 读取缓存发送
    const cache_file = path.join(this.dir, "../record", common.md5(file).toString("hex"));
    if (!["0", "false", "no"].includes(String(cache))) {
        try {
            return await _uploadPtt.call(
                this, target,
                await fs.promises.readFile(cache_file)
            );
        } catch {
            fs.unlink(cache_file, common.NOOP);
        }
    }

    // base64
    if (file.startsWith && file.startsWith("base64://")) {
        this.logger.debug("转换base64音频");
        file = Buffer.from(file.slice(9), "base64");
    }

    // bytes
    if (file instanceof Uint8Array || file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
        const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
        // 文件为silk或amr格式直接发送
        const head = String(buf.slice(0, 7));
        if (head.includes("SILK") || head.includes("AMR")) {
            return await _uploadPtt.call(this, target, buf);
        } else {
            // 写入临时文件->音频转换->发送&删除临时文件
            const tmp_file = cache_file + common.uuid() + ".ptt";
            await fs.promises.writeFile(tmp_file, buf);
            try {
                return await _uploadPtt.call(
                    this, target,
                    await _audioTrans.call(this, cache_file, tmp_file)
                );
            } finally {
                fs.unlink(tmp_file, common.NOOP);
            }
        }
    }

    if (file.startsWith && file.startsWith("http")) {
        this.logger.debug("开始下载网络音频：" + file);
        const res = await downloadFromWeb(file, headers);
        const tmp_file = cache_file + common.uuid() + ".ptt";
        timeout = Math.abs(parseFloat(timeout)) || 60;
        const id = setTimeout(()=>{
            this.logger.warn(`download timeout after ${timeout}s`);
            res.destroy();
            fs.unlink(tmp_file, common.NOOP);
        }, timeout * 1000)
        await common.pipeline(res, fs.createWriteStream(tmp_file));
        clearTimeout(id);
        this.logger.debug("网络音频下载完成：" + file);
        const head = await _read7Bytes(tmp_file);
        if (head.includes("SILK") || head.includes("AMR")) {
            await fs.promises.rename(tmp_file, cache_file);
            return await _uploadPtt.call(
                this, target,
                await fs.promises.readFile(cache_file));
        } else {
            const buf = await _audioTrans.call(this, cache_file, tmp_file);
            fs.unlink(tmp_file, common.NOOP);
            return await _uploadPtt.call(
                this, target, buf
            );
        }
    } else {
        // 本地文件
        const local_file = String(file).replace(/^file:\/{2,3}/, "");
        const head = await _read7Bytes(local_file);
        if (head.includes("SILK") || head.includes("AMR")) {
            return await _uploadPtt.call(
                this, target,
                await fs.promises.readFile(local_file));
        } else {
            return await _uploadPtt.call(
                this, target,
                await _audioTrans.call(this, cache_file, local_file)
            );
        }
    }
}

/**
 * @this {import("../ref").Client}
 * @param {string} cache_file 
 * @param {string} tmp_file 
 * @returns {Promise<Buffer>}
 */
function _audioTrans(cache_file, tmp_file) {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -y -i ${tmp_file} -ac 1 -ar 8000 -f amr ${cache_file}`, async (error, stdout, stderr) => {
            this.logger.debug("ffmpeg output: " + stdout + stderr);
            try {
                const amr = await fs.promises.readFile(cache_file);
                this.logger.info("ffmpeg成功转换了一个音频。");
                resolve(amr);
            } catch {
                reject(ERROR_FFMPEG_FAILED);
            }
        });
    });
}

/**
 * @param {string} filepath 
 */
async function _read7Bytes(filepath) {
    const fd = await fs.promises.open(filepath, "r");
    const buf = (await fd.read(Buffer.alloc(7), 0, 7, 0)).buffer;
    fd.close();
    return buf;
}

/**
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {Buffer} buf 
 * @returns {Promise<Buffer>}
 */
async function _uploadPtt(target, buf) {
    const md5 = common.md5(buf);
    const codec = String(buf.slice(0, 7)).includes("SILK") ? 1 : 0;
    const body = pb.encode({
        1: 3,
        2: 3,
        5: [{
            1: target,
            2: this.uin,
            3: 0,
            4: md5,
            5: buf.length,
            6: md5,
            7: 5,
            8: 9,
            9: 4,
            11: 0,
            10: this.apk.version,
            12: 1,
            13: 1,
            14: codec,
            15: 1,
        }],
    });
    const blob = await this.sendUni("PttStore.GroupPttUp", body);
    const rsp = pb.decode(blob)[5];
    if (!rsp[4]) {
        const ip = Array.isArray(rsp[5]) ? rsp[5][0] : rsp[5],
            port = Array.isArray(rsp[6]) ? rsp[6][0] : rsp[6];
        const ukey = rsp[7].toHex(), filekey = rsp[11].toHex();
        const params = {
            ver: 4679,
            ukey, filekey,
            filesize: buf.length,
            bmd5: md5.toString("hex"),
            mType: "pttDu",
            voice_encodec: codec
        };
        const url = `http://${int32ip2str(ip)}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": `QQ/${this.apk.version} CFNetwork/1126`,
            "Net-Type": "Wifi"
        };
        this.logger.debug("开始上传语音到tx服务器。");
        await new Promise((resolve) => {
            http.request(url, { method: "POST", headers }, resolve)
                .on("error", (e) => {
                    this.logger.warn("语音上传遇到错误：" + e.message);
                    resolve();
                })
                .end(buf);
        });
        this.logger.debug("语音上传结束。");
    }
    const fid = rsp[11].toBuffer();
    return pb.encode({
        1: 4,
        2: this.uin,
        3: fid,
        4: md5,
        5: md5.toString("hex") + ".amr",
        6: buf.length,
        11: 1,
        18: fid,
        30: Buffer.from([8, 0, 40, 0, 56, 0]),
    });
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
    makePttElem, getVideoUrl
};
