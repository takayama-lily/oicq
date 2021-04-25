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
const { downloadWebRecord, int32ip2str } = require("../service");
const pb = require("../pb");
const common = require("../common");

/**
 * @this {import("../ref").Client}
 * @param {number} target
 * @param {import("../ref").ImgPttElem["data"]} cq 
 * @returns {Promise<Buffer>}
 */
async function genPttElem(target, cq) {
    let { file, cache, timeout, proxy, headers } = cq;
    let buf, tmp_file;

    // 转发收到的语音
    if (typeof file === "string" && file.startsWith("protobuf://")) {
        return Buffer.from(file.replace("protobuf://", ""), "base64");
    }

    // 读取缓存发送
    const cache_file = path.join(this.dir, "..", "record", common.md5(file).toString("hex"));
    if (!["0", "false", "no"].includes(String(cache))) {
        try {
            buf = await fs.promises.readFile(cache_file);
            this.logger.debug("使用缓存的amr音频文件");
            return await _uploadPtt.call(this, target, buf);
        } catch { }
    }
    
    if (file instanceof Buffer) {
        buf = file;
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
        buf = Buffer.from(file);
    } else if (file.startsWith("base64://")) {
        this.logger.debug("转换base64音频");
        buf = Buffer.from(file.replace("base64://", ""), "base64");
    } else if (file.startsWith("http")) {
        this.logger.debug("开始下载网络音频：" + file);
        proxy = ["1", "true", "yes"].includes(String(proxy));
        buf = await downloadWebRecord(file, proxy, timeout, headers);
        this.logger.debug("网络音频下载完成：" + file);
    } else {
        // 本地文件(不需要临时文件)
        tmp_file = String(file).trim().replace(/^file:\/{2,3}/, "");

        // 读取前7个字节，若为为silk或amr格式直接发送
        const head = await _read7Bytes(tmp_file);
        if (head.includes("SILK") || head.includes("AMR")) {
            buf = await fs.promises.readFile(tmp_file);
            return await _uploadPtt.call(this, target, buf);
        }

        // 音频转换(生成缓存文件)->发送
        buf = await _audioTrans.call(this, cache_file, tmp_file);
        return await _uploadPtt.call(this, target, buf);
    }

    // 非本地文件
    if (buf) {
        // 文件为silk或amr格式直接发送
        const head = buf.slice(0, 7).toString();
        if (head.includes("SILK") || head.includes("AMR")) {
            fs.writeFile(cache_file, buf, common.NOOP);
            return await _uploadPtt.call(this, target, buf);
        }

        // 写入临时文件->音频转换(生成缓存文件)->删除临时文件->发送
        tmp_file = path.join(path.dirname(cache_file), Math.random() + "" + Date.now());
        await fs.promises.writeFile(tmp_file, buf);
        try {
            buf = await _audioTrans.call(this, cache_file, tmp_file);
        } finally {
            fs.unlink(tmp_file, common.NOOP);
        }
        return await _uploadPtt.call(this, target, buf);
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
                reject("音频转码到amr失败，请确认你的ffmpeg可以处理此转换");
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
        const ukey = rsp[7].raw.toString("hex"), filekey = rsp[11].raw.toString("hex");
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
    const fid = rsp[11].raw;
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

module.exports = {
    genPttElem,
};
