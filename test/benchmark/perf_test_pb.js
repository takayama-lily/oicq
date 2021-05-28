"use strict"
const { Random } = require("mockjs")
const pb = require("../../lib/algo/pb")

function genObj() {
    return {
        1: Random.integer(),
        2: Random.integer(),
        3: Random.word(),
        4: Random.sentence(),
        5: {
            1: Random.integer(),
            2: Random.integer(),
            3: Random.word(),
            4: Random.sentence(),
            5: Random.integer(),
        },
        6: Random.integer(),
        7: Random.integer(),
        8: Random.word(),
        9: Random.sentence(),
        10: {
            1: Random.integer(),
            2: Random.integer(),
            3: Random.word(),
            4: Random.sentence(),
            5: Random.integer(),
        },
    };
}

function runEncode(times) {
    const label = `pb encode / ${times} times (${times*6/1e4}MB)`
    console.time(label)
    for (let i = 0; i < times; ++i) {
        const encoded = pb.encode(genObj());
    }
    console.timeEnd(label)
}

function runEncodeWithDecode(times) {
    const label = `pb encode / ${times} times / with decode (${times*6/1e4}MB)`
    console.time(label)
    for (let i = 0; i < times; ++i) {
        const encoded = pb.encode(genObj());
        const decoded = pb.decode(encoded)
    }
    console.timeEnd(label)
}

console.log("--pb performance test begin--")

runEncode(1e3)
runEncodeWithDecode(1e3)
runEncode(1e4)
runEncodeWithDecode(1e4)
runEncode(1e5)
runEncodeWithDecode(1e5)
// runEncode(1e6)
// runEncodeWithDecode(1e6)

//解码有点慢，需要优化

console.log("--pb performance test end--\n")
