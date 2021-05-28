"use strict"

const { randomBytes } = require("crypto")
const { assert } = require("chai")
const { Random } = require("mockjs")

const tea = require("../lib/algo/tea")
const pb = require("../lib/algo/pb")

function genObj() {
    return {
        1: 0,
        2: Number.MAX_SAFE_INTEGER,
        3: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(Random.integer(1, 0xffffffff)),
        4: Random.integer(1, 0xffffffff),
        // 5: Random.float(),
        6: randomBytes(Random.integer(50, 100)),
        7: Random.sentence(),
    }
}

/**
 * @param {ReturnType<genObj>} obj 
 * @param {ReturnType<pb.decode>} decoded 
 */
function compare(obj, decoded) {
    assert.strictEqual(obj[1], decoded[1])
    assert.strictEqual(obj[2], decoded[2])
    assert.strictEqual(obj[3], decoded[3])
    assert.strictEqual(obj[4], decoded[4])
    assert.strictEqual(Buffer.compare(obj[6], decoded[6].toBuffer()), 0)
    assert.strictEqual(obj[7], decoded[7].toString())
    assert.strictEqual(obj[7], decoded[7] + "")
    assert.strictEqual(obj[7], `${decoded[7]}`)
}

describe("algorithm", () => {

    describe("tea", () => {
        it("encrypt/decrypt test", () => {
            for (let i = 0; i < 1000; ++i) {
                const data = randomBytes(Random.integer(0, 1000))
                const key = randomBytes(16)
                const encrypted = tea.encrypt(data, key)
                const decrypted = tea.decrypt(encrypted, key)
                assert.strictEqual(Buffer.compare(data, decrypted), 0)
            }
        })
    })

    describe("protobuf", () => {
        it("encode/decode test", () => {
            for (let i = 0; i < 1000; ++i) {
                const obj = genObj()
                const array_tag = Random.integer(0xff, 0xffff - 1)
                obj[array_tag] = [
                    genObj(), genObj()
                ]
                const nested_tag = Random.integer(0xffff, 0xffffff)
                obj[nested_tag] = genObj()
                const encoded = pb.encode(obj)
                const decoded = pb.decode(Buffer.from(encoded))
                // console.log(obj)
                // console.log(decoded)
                compare(obj, decoded)
                compare(obj[array_tag][0], decoded[array_tag][0])
                compare(obj[array_tag][1], decoded[array_tag][1])
                compare(obj[nested_tag], decoded[nested_tag])
            }
        })
    })
})
