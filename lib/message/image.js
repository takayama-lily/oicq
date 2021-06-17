/**
 * 构造图片节点
 * 上传图片
 */
"use strict";
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const probe = require("probe-image-size");
const pb = require("../algo/pb");
const common = require("../common");
const { downloadFromWeb, highwayUploadStream, MAX_UPLOAD_SIZE } = require("../service");

const ERROR_UNSUPPORTED_FILE = new Error("file必须为Buffer或string类型");
const ERROR_BAD_FILE = new Error("ERROR_BAD_FILE");
const ERROR_NO_CACHE = new Error("ERROR_NO_CACHE");
const ERROR_NOT_IMAGE = new Error("不是有效的图片");

const img_types = {
    jpg: 1000,
    png: 1001,
    webp: 1002,
    bmp: 1005,
    gif: 2000,
    face: 4,
};

const img_exts = {
    3: "png",
    4: "face",
    1000: "jpg",
    1001: "png",
    1002: "webp",
    1003: "jpg",
    1005: "bmp",
    2000: "gif",
    2001: "png",
};

/**
 * 生成CQ码file字段
 * @param {string} md5 
 * @param {number} size 
 * @param {number} width 
 * @param {number} height 
 * @param {number} type 
 */
function buildImageFileParam(md5, size, width, height, type) {
    size = size > 0 ? String(size) : "";
    width = width > 0 ? String(width) : "0";
    height = height > 0 ? String(height) : "0";
    const ext = img_exts[type] ? img_exts[type] : "jpg";
    return md5 + size + "-" + width + "-" + height + "." + ext;
}

/**
 * 图片处理流程
 * 
 * localfile -> get stat(md5,size,hw) ↘
 * httpfile  -> tmplocalfile & get stat -> createReadStream() ↘
 * Buffer -> get stat(md5,size,height,width) -> Readable.from() -> uploadImages(20并发) -> exists?
 *    ↑                                                                                    no ↓ 
 * base64file                                                                       highwayUploadStream
 */
class ImageBuilder {

    /**
     * 图片protobuf节点
     * @public
     * @type {import("../ref").Proto}
     */
    nested;

    /**
     * 图片字节流
     * @public
     * @type {Readable}
     */
    readable;

    /**
     * 服务端返回的fileid
     * @public
     * @type {Buffer}
     */
    fid;

    /**
     * 网络图片下载任务
     * @public
     * @type {Promise}
     */
    task;

    /**
     * 上传ticket
     * @public
     * @type {Buffer}
     */
    ticket;
    cmd = 2;

    /**
     * @public
     */
    md5 = randomBytes(16);
    /**
     * @public
     */
    size = 0xff;
    /**
     * @public
     */
    width = 960;
    /**
     * @public
     */
    height = 640;
    /**
     * @public
     */
    type = 1000;

    /**
     * 图像信息缓存文件路径
     * @private
     * @type {string}
     */
    filepath;

    /**
     * 网络图片临时文件路径
     * @private
     * @type {string}
     */
    tmpfile;

    /**
     * @private
     * @type {number}
     */
    timeout;
    /**
     * @private
     * @type {import("http").OutgoingHttpHeaders}
     */
    headers;
    /**
     * @private
     * @type {string}
     */
    address;

    /**
     * @param {import("../ref").Client} c 
     */
    constructor(c, c2c = false) {
        this.c = c;
        this.c2c = c2c;
        if (c2c)
            this.cmd = 1;
    }

    /**
     * 计算图片md5, size, 长宽
     * @private
     * @param {Buffer} buf 
     */
    probeSync(buf) {
        const dimensions = probe.sync(buf);
        this.setProbe(dimensions);
        this.md5 = common.md5(buf);
        this.size = buf.length;
        this.readable = Readable.from(buf, { objectMode: false });
    }

    /**
     * @private
     * @param {probe.ProbeResult} dimensions 
     */
    setProbe(dimensions) {
        if (!dimensions)
            throw ERROR_NOT_IMAGE;
        this.width = dimensions.width;
        this.height = dimensions.height;
        this.type = img_types[dimensions.type] || 1000;
    }

    /**
     * 从缓存文件中获取md5, size, 长宽
     * @private
     * @param {string} file 
     */
    parseImageFileParam(file) {
        let md5, size, ext;
        const split = file.split("-");
        md5 = Buffer.from(split[0].slice(0, 32), "hex");
        if (md5.length !== 16)
            throw ERROR_BAD_FILE;
        this.md5 = md5;
        size = parseInt(split[0].slice(32));
        this.size = size > 0 ? size : 0xff;
        if (split[1] > 0)
            this.width = parseInt(split[1]);
        split[2] = parseInt(split[2]);
        if (split[2] > 0)
            this.height = split[2];
        const split2 = file.split(".");
        ext = split2[1] ? split2[1] : "jpg";
        if (img_types[ext])
            this.type = img_types[ext];
    }

    /**
     * 构造图片protobuf节点
     * @private
     */
    setNested() {
        let nested;
        if (this.c2c) {
            nested = {
                1: this.md5.toString("hex"),
                2: this.size,
                3: this.fid,
                5: this.type,
                7: this.md5,
                8: this.height,
                9: this.width,
                10: this.fid,
                13: 0, //原图
                16: this.type === 4 ? 5 : 0,
                24: 0,
                25: 0,
            };
        } else {
            nested = {
                2: this.md5.toString("hex") + ".gif",
                7: this.fid,
                8: 0,
                9: 0,
                10: 66,
                12: 1,
                13: this.md5,
                // 17: 3,
                20: this.type,
                22: this.width,
                23: this.height,
                24: 200,
                25: this.size,
                26: 0, //原图
                29: 0,
                30: 0,
            };
        }
        if (this.nested)
            Object.assign(this.nested, nested);
        else
            this.nested = nested;
    }

    /**
     * 下载网络图片并生成缓存文件
     * @private
     */
    async download() {
        this.c.logger.debug("开始下载网络图片: " + this.address);
        try {
            this.tmpfile = this.filepath + common.uuid() + ".img";
            var res = await downloadFromWeb(this.address, this.headers);
            var id = setTimeout(()=>{
                this.c.logger.warn(`download timeout after ${this.timeout}s`);
                res.destroy();
            }, this.timeout * 1000);
            const [dimensions, md5] = await Promise.all([
                probe(res, true),
                common.md5Stream(res),
                common.pipeline(res, fs.createWriteStream(this.tmpfile)),
            ])
            clearTimeout(id);
            this.setProbe(dimensions);
            this.md5 = md5;
            this.size = (await fs.promises.stat(this.tmpfile)).size;
            this.c.logger.debug("图片下载完成: " + this.address);
            this.readable = fs.createReadStream(this.tmpfile, { highWaterMark: 1024*256 });
        } catch (e) {
            clearTimeout(id);
            this.deleteTmpFile();
            this.c.logger.warn(`图片下载失败: ${e.message} (${this.address})`);
        }
        this.setNested();
        const cache = buildImageFileParam(this.md5.toString("hex"), this.size, this.width, this.height, this.type);
        fs.writeFile(this.filepath, cache, common.NOOP);
    }

    /**
     * 服务端返回的fid(fileid)写入图片节点
     * @public
     * @param {Buffer} fid 
     */
    setFid(fid) {
        if (!this.nested)
            return;
        this.fid = fid;
        if (this.c2c) {
            this.nested[3] = fid;
            this.nested[10] = fid;
        } else {
            this.nested[7] = fid;
        }
    }

    /**
     * @public
     * 图片失效时删除缓存文件(仅http)
     */
    deleteCache() {
        if (this.filepath) {
            fs.unlink(this.filepath, common.NOOP)
        }
    }

    /**
     * @public
     * 删除临时图片文件
     */
    deleteTmpFile() {
        if (this.readable)
            this.readable.destroy();
        if (this.tmpfile) {
            fs.unlink(this.tmpfile, common.NOOP);
        }
    }

    /**
     * @public
     * @param {import("../ref").ImgPttElem["data"]} cq 
     */
    async buildNested(cq) {
        let { file, cache, timeout, headers } = cq;

        // bytes
        if (file instanceof Uint8Array || file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
            if (!Buffer.isBuffer(file))
                file = Buffer.from(file);
            this.probeSync(file);
        } else if (typeof file !== "string" && file instanceof String === false) {
            throw ERROR_UNSUPPORTED_FILE;
        }

        // base64图片
        else if (file.startsWith("base64://")) {
            this.c.logger.debug("转换base64图片");
            this.probeSync(Buffer.from(file.slice(9), "base64"));
        }

        // 网络图片
        else if (file.startsWith("http")) {
            const filename = common.md5(Buffer.from(file, "utf-8")).toString("hex");
            this.filepath = path.join(this.c.dir, "..", "image", filename);
            this.address = file;
            this.timeout = Math.abs(parseFloat(timeout)) || 60;
            this.headers = headers;
            try {
                if (["0", "false", "no"].includes(String(cache)))
                    throw ERROR_NO_CACHE;
                this.parseImageFileParam(await fs.promises.readFile(this.filepath, "utf8"));
                this.c.logger.debug("使用缓存的图片信息");
            } catch {
                this.task = this.download();
            }
        }

        else {
            try {
                //收到的图片
                this.parseImageFileParam(file);
            } catch {
                //本地图片
                file = file.replace(/^file:\/{2,3}/, "");
                const stat = await fs.promises.stat(file);
                if (stat.size <= 0 || stat.size > MAX_UPLOAD_SIZE)
                    throw new Error("图片尺寸太大, size: " + stat.size);
                const readable = fs.createReadStream(file);
                const [dimensions, md5] = await Promise.all([
                    probe(readable, true),
                    common.md5Stream(readable)
                ])
                readable.destroy();
                this.setProbe(dimensions);
                this.md5 = md5;
                this.size = stat.size;
                this.readable = fs.createReadStream(file, { highWaterMark: 1024*256 });
            }
        }

        this.setNested();
    }
}

/**
 * 上传群图(最多20张)
 * @this {import("../ref").Client}
 * @param {number} group_id 
 * @param {ImageBuilder[]} imgs 
 */
async function _groupPicUp(group_id, imgs) {
    const req = [];
    for (const v of imgs) {
        req.push({
            1: group_id,
            2: this.uin,
            3: 0,
            4: v.md5,
            5: v.size,
            6: v.md5.toString("hex"),
            7: 5,
            8: 9,
            9: 1,
            12: v.type,
            13: this.apk.version,
            15: 1052,
            16: 0, //原图
            19: 0,
        });
    }
    const body = pb.encode({
        1: 3,
        2: 1,
        3: req,
    });
    const blob = await this.sendUni("ImgStore.GroupPicUp", body);
    return pb.decode(blob)[3];
}

/**
 * 上传私聊图(最多20张)
 * @this {import("../ref").Client}
 * @param {number} user_id 
 * @param {ImageBuilder[]} imgs 
 */
async function _offPicUp(user_id, imgs) {
    const req = [];
    for (const v of imgs) {
        req.push({
            1: this.uin,
            2: user_id,
            3: 0,
            4: v.md5,
            5: v.size,
            6: v.md5.toString("hex"),
            7: 5,
            8: 9,
            10: 0,
            12: 1,
            13: 0, //原图
            16: v.type,
            17: this.apk.version,
            22: 0,
        });
    }
    const body = pb.encode({
        1: 1,
        2: req
    });
    const blob = await this.sendUni("LongConn.OffPicUp", body);
    return pb.decode(blob)[2];
}

/**
 * 最多同时上传20张
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {ImageBuilder[]} imgs 
 */
async function uploadImages(target, imgs, c2c = false) {
    let n = 0;
    const j = c2c ? 1 : 0;
    while (imgs.length > n) {
        try {
            this.logger.debug("开始请求上传图片到tx服务器");
            let rsp = await (c2c ? _offPicUp : _groupPicUp).call(this, target, imgs.slice(n, n + 20));
            rsp = Array.isArray(rsp) ? rsp : [rsp];
            const tasks = [];
            for (let i = n; i < imgs.length; ++i) {
                if (i >= n + 20)
                    break;
                const v = rsp[i % 20];
                if (v[2 + j] !== 0)
                    throw new Error(String(v[3 + j]));
                imgs[i].setFid(c2c ? v[10].toBuffer() : v[9]);
                if (v[4 + j]) {
                    imgs[i].deleteTmpFile();
                    continue;
                }
                if (!imgs[i].readable) {
                    imgs[i].deleteCache()
                    continue;
                }
                let ip = v[6 + j], port = v[7 + j];
                if (Array.isArray(ip))
                    ip = ip[0];
                if (Array.isArray(port))
                    port = port[0];
                imgs[i].ticket = v[8 + j].toBuffer();
                tasks.push(highwayUploadStream.call(this, imgs[i].readable, imgs[i], ip, port).then(() => {
                    imgs[i].deleteTmpFile();
                }));
            }
            await Promise.all(tasks);
            this.logger.debug("请求图片上传结束");
        } catch (e) {
            this.logger.warn("请求图片上传遇到错误: " + e.message);
            this.logger.debug(e);
        }
        n += 20;
    }
}

module.exports = {
    ImageBuilder, uploadImages, buildImageFileParam
};
