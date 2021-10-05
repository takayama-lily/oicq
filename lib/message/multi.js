"use strict";
const { Readable } = require("stream");
const zlib = require("zlib");
const util = require("util");
const { randomBytes } = require("crypto");
const face = require("./face");
const { ImageBuilder, uploadImages } = require("./image");
const pb = require("../algo/pb");
const common = require("../common");
const { highwayUploadStream } = require("../service");
const gzip = util.promisify(zlib.gzip);

function buildTextElem(str) {
    if (!str) str = "";
    return {
        1: {
            1: String(str)
        }
    };
}

function buildFaceElem(id) {
    id = Number(id);
    if (id <= 0xff) {
        const old = Buffer.allocUnsafe(2);
        old.writeUInt16BE(0x1441 + id);
        return {
            2: {
                1: id,
                2: old,
                11: face.FACE_OLD_BUF
            }
        };
    } else {
        const text = face.map[id] || ("/" + id);
        return {
            53: {
                1: 33,
                2: {
                    1: id,
                    2: text,
                    3: text
                },
                3: 1
            }
        };
    }
}

/**
 * @this {import("../ref").Client}
 * @param {import("../ref").FakeMessage[]} iterable 
 */
async function makeForwardMsg(iterable, dm = false) {

    if (typeof iterable[Symbol.iterator] !== "function")
        iterable = [iterable];

    /** @type {import("../ref").Msg[]} */
    const nodes = [];
    /** @type {ImageBuilder[]} */
    const imgs = [];
    /** @type {Promise<void>[]} */
    const tasks = [];
    let preview = "";
    let cnt = 0;

    for (const fake of iterable) {
        if (!fake.message || !common.checkUin(fake.user_id)) {
            console.log(fake)
            this.logger.warn("skip invalid FakeMessage: " + JSON.stringify(fake));
            continue;
        }
        const elements = [];
        let brief = "";
        {
            /** @type {import("../ref").MessageElem[]} */
            let sendable = fake.message;
            if (typeof sendable === "string" || typeof sendable[Symbol.iterator] !== "function")
                sendable = [sendable];
            
            for (const elem of sendable) {
                if (typeof elem === "string") {
                    elements.push(buildTextElem(elem));
                    brief += elem;
                    continue;
                }
                if (!elem.data)
                    continue;
                switch (elem.type) {
                case "text":
                case "at":
                    elements.push(buildTextElem(elem.data.text));
                    brief += elem.data.text;
                    break;
                case "face":
                    elements.push(buildFaceElem(elem.data.id));
                    brief += "[表情]";
                    break;
                case "image":
                    const img = new ImageBuilder(this, dm);
                    try {
                        await img.buildNested(elem.data);
                        imgs.push(img);
                        if (img.task)
                            tasks.push(img.task);
                        elements.push({ [dm?4:8]: img.nested });
                        brief += "[图片]";
                    } catch (e) {
                        this.logger.warn(e.message);
                    }
                    break;
                }
            }
        }

        if (!elements.length)
            continue;
        const seq = randomBytes(2).readInt16BE();
        const random = randomBytes(4).readInt32BE();
        fake.nickname = String(fake.nickname || fake.user_id);
        nodes.push({
            1: {
                1: fake.user_id,
                2: this.uin,
                3: dm ? 166 : 82,
                4: dm ? 11 : null,
                5: seq,
                6: fake.time || common.timestamp(),
                7: common.genMessageUuid(random),
                9: dm ? null : {
                    1: this.uin,
                    4: fake.nickname,
                },
                14: fake.nickname,
                20: {
                    2: 1
                }
            },
            3: {
                1: {
                    2: elements
                }
            }
        });
        if (cnt < 4) {
            ++cnt
            preview += `<title color="#777777" size="26">${common.escapeXml(fake.nickname)}: ${common.escapeXml(brief.slice(0, 50))}</title>`;
        }
    }
    if (!nodes.length)
        throw new Error("empty message");

    await Promise.all(tasks);
    await uploadImages.call(this, this.uin, imgs, dm);

    const compressed = await gzip(pb.encode({
        1: nodes,
        2: {
            1: "MultiMsg",
            2: {
                1: nodes
            }
        }
    }));
    try {
        var resid = await uploadMultiMsg.call(this, this.uin, compressed);
    } catch (e) {
        throw new Error("failed to upload forward msg");
    }
    
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<msg brief="[聊天记录]" m_fileName="${common.uuid().toUpperCase()}" action="viewMultiMsg" tSum="${nodes.length}" flag="3" m_resid="${resid}" serviceID="35" m_fileSize="${compressed.length}"><item layout="1"><title color="#000000" size="34">转发的聊天记录</title>${preview}<hr></hr><summary color="#808080" size="26">查看${nodes.length}条转发消息</summary></item><source name="聊天记录"></source></msg>`;
    const data = {
        type: "xml",
        data: {
            data: xml,
            type: 35,
            // text: "你的QQ暂不支持查看[转发多条消息]，请期待后续版本。"
        }
    };
    return { result: 0, data};
}

/**
 * @this {import("../ref").Client}
 * @param {number} target 
 * @param {Buffer} compressed 
 * @returns {Promise<Buffer>} resid
 */
async function uploadMultiMsg(target, compressed) {
    const body = pb.encode({
        1: 1,
        2: 5,
        3: 9,
        4: 3,
        5: this.apk.version,
        6: [{
            1: target,
            2: compressed.length,
            3: common.md5(compressed),
            4: 3,
            5: 0,
        }],
        8: 1,
    });
    const blob = await this.sendUni("MultiMsg.ApplyUp", body);
    const rsp = pb.decode(blob)[2];
    if (rsp[1] > 0)
        throw new Error();
    const buf = pb.encode({
        1: 1,
        2: 5,
        3: 9,
        4: [{
            //1: 3,
            2: target,
            4: compressed,
            5: 2,
            6: rsp[3].toBuffer(),
        }],
    });
    const o = {
        buf: buf,
        md5: common.md5(buf),
        key: rsp[10].toBuffer()
    };
    const ip = Array.isArray(rsp[4]) ? rsp[4][0] : rsp[4],
        port = Array.isArray(rsp[5]) ? rsp[5][0] : rsp[5];
    await highwayUploadStream.call(this, Readable.from(Buffer.from(buf), { objectMode: false }), {
        cmd: 27,
        md5: common.md5(buf),
        size: buf.length,
        ticket: rsp[10].toBuffer(),
    }, ip, port, o);
    return rsp[2].toBuffer();
}

module.exports = {
    makeForwardMsg, uploadMultiMsg,
};
