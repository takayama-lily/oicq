"use strict";
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const imgSizeOf = require('image-size');
const pb = require("../pb");
const common = require("../common");
const { downloadWebImage, readFile, highwayUpload } = require("../service");

const img_types = {
    jpg: 1000,
    png: 1001,
    bmp: 1005,
    gif: 2000,
    face: 4,
};

const img_exts = {
    4: "face",
    1000: "jpg",
    1001: "png",
    1003: "jpg",
    1005: "bmp",
    2000: "gif",
};

function buildImageFileParam(md5, size, width, height, type) {
    md5 = md5.toString("hex");
    size = size > 0 ? String(size) : "";
    width = width > 0 ? String(width) : "0";
    height = height > 0 ? String(height) : "0";
    const ext = img_exts[type] ? img_exts[type] : "jpg";
    return md5 + size + "-" + width + "-" + height + "." + ext;
}

class ImageBuilder {
    nested;
    buf;
    fid;
    md5 = randomBytes(16);
    size = 0xff;
    width = 960;
    height = 640;
    type = 1000;

    task;
    filepath;

    proxy;
    timeout;
    headers;
    address;

    /**
     * @param {import("../ref").Client} c 
     */
    constructor(c, c2c = false) {
        this.c = c;
        this.c2c = c2c;
    }

    /**
     * @private
     */
    calcSizeOf() {
        if (!this.buf)
            return;
        this.size = this.buf.length;
        this.md5 = common.md5(this.buf);
        const dimensions = imgSizeOf(this.buf);
        this.width = dimensions.width;
        this.height = dimensions.height;
        if (img_types[dimensions.type])
            this.type = img_types[dimensions.type];
    }

    /**
     * @private
     * @param {String} file 
     */
    parseImageFileParam(file) {
        let md5, size, ext;
        const split = file.split("-");
        md5 = Buffer.from(split[0].slice(0, 32), "hex");
        if (md5.length !== 16)
            throw new Error("bad file");
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
     * @private
     */
    setNested() {
        if (this.c2c) {
            var nested = {
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
            var nested = {
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
     * @private
     */
    async download() {
        if (!this.address)
            return;
        try {
            this.c.logger.debug("开始下载网络图片：" + this.address);
            this.buf = await downloadWebImage(this.address, this.proxy, this.timeout, this.headers);
            this.c.logger.debug("图片下载完成：" + this.address);
        } catch (e) {
            this.c.logger.warn(`下载网络图片失败：${this.address}`);
            this.address = null;
            return this.c.logger.warn(e);
        }
        try {
            this.calcSizeOf();
        } catch {
            this.c.logger.warn(`${this.address} 不是有效的图片`);
            this.buf = null;
            this.address = null;
            return;
        }

        this.setNested();
        if (this.filepath) {
            const file = buildImageFileParam(this.md5, this.size, this.width, this.height, this.type);
            fs.writeFile(this.filepath, file, () => { });
        }
    }

    /**
     * @public
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
     */
    async buildNested(obj) {
        let { file, url, cache, timeout, proxy, headers } = obj;
        if (!file)
            return this.c.logger.warn(`file不是有效的图片`);

        // bytes
        if (file instanceof Buffer || file instanceof Uint8Array) {
            this.buf = Buffer.from(file);
        }

        // 网络图片
        else if (file.startsWith("http")) {
            const filename = common.md5(Buffer.from(file, "utf-8")).toString('hex');
            this.filepath = path.join(this.c.dir, "..", "image", filename);
            this.address = file;
            this.proxy = ["1", "true", "yes"].includes(String(proxy));
            this.timeout = timeout;
            this.headers = headers;
            try {
                if (["0", "false", "no"].includes(String(cache)))
                    throw new Error("no cache");
                this.parseImageFileParam(await fs.promises.readFile(this.filepath, "utf8"));
                this.c.logger.debug("使用缓存的图片信息");
            } catch {
                this.task = this.download();
            }
        }

        // base64图片
        else if (file.startsWith("base64://")) {
            this.c.logger.debug("转换base64图片");
            file = file.trim().replace("base64://", "");
            this.buf = Buffer.from(file, "base64");
        }

        else {
            try {
                //收到的图片
                this.parseImageFileParam(file);
            } catch {
                //本地图片
                try {
                    file = file.trim().replace(/^file:\/{2,3}/, "");
                    this.buf = await readFile(file);
                } catch (e) {
                    this.c.logger.warn(`获取本地图片 ${file} 失败`);
                    return this.c.logger.warn(e);
                }
            }
        }

        try {
            this.calcSizeOf();
        } catch {
            this.buf = null;
            return this.c.logger.warn(`file不是有效的图片`);
        }

        if (!this.c2c && url && url.includes("gchatpic_new")) {
            const id = url.match(/-[0-9]+-/);
            if (id)
                this.fid = parseInt(id[0].replace("-", ""));
        }
        if (this.c2c && url && url.includes("offpic_new")) {
            const id = url.match(/\/\/[0-9]+-[0-9]+-[0-9A-Za-z]+/);
            if (id)
                this.fid = id[0].replace("/", "");
        }

        this.setNested();
    }
}

/**
 * @this {import("../ref").Client}
 * @param {ImageBuilder[]} imgs 
 */
async function imageStore(group_id, imgs) {
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
    const blob = await this.sendUNI("ImgStore.GroupPicUp", body);
    return pb.decode(blob)[3];
}

/**
 * @this {import("../ref").Client}
 * @param {ImageBuilder[]} imgs 
 */
async function offPicUp(user_id, imgs) {
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
    const blob = await this.sendUNI("LongConn.OffPicUp", body);
    return pb.decode(blob)[2];
}

/**
 * @this {import("../ref").Client}
 * @param {ImageBuilder[]} imgs 
 * @param {Boolean} c2c 
 */
async function uploadImages(target, imgs, c2c) {
    let n = 0;
    const j = c2c ? 1 : 0;
    while (imgs.length > n) {
        try {
            this.logger.debug("开始请求上传图片到tx服务器");
            let rsp = await (c2c ? offPicUp : imageStore).call(this, target, imgs.slice(n, n + 20));
            rsp = Array.isArray(rsp) ? rsp : [rsp];
            const tasks = [];
            for (let i = n; i < imgs.length; ++i) {
                const v = rsp[i % 20];
                imgs[i].setFid(c2c ? v[10].raw : v[9]);
                if (v[4 + j] || !imgs[i].buf)
                    continue;
                let ip = v[6 + j], port = v[7 + j];
                if (Array.isArray(ip))
                    ip = ip[0];
                if (Array.isArray(port))
                    port = port[0];
                imgs[i].key = v[8 + j].raw;
                tasks.push(highwayUpload.call(this, ip, port, imgs[i], c2c ? 1 : 2));
            }
            await Promise.all(tasks);
            this.logger.debug("请求图片上传结束");
        } catch (e) {
            this.logger.debug("请求图片上传遇到错误");
            this.logger.debug(e);
        }
        n += 20;
    }
}

module.exports = {
    ImageBuilder, uploadImages, buildImageFileParam
};
