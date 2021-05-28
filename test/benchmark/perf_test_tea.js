"use strict"
const tea = require("../../lib/algo/tea")

function runEncrypt(len, times) {
    const label = `tea encrypt / ${len} bytes / ${times} times`
    console.time(label)
    for (let i = 0; i < times; ++i) {
        const data = Buffer.allocUnsafe(len), key = Buffer.allocUnsafe(16)
        const encrypted = tea.encrypt(data, key)
    }
    console.timeEnd(label)
}

function runEncryptWithDecrypt(len, times) {
    const label = `tea encrypt / ${len} bytes / ${times} times / with decrypt`
    console.time(label)
    for (let i = 0; i < times; ++i) {
        const data = Buffer.allocUnsafe(len), key = Buffer.allocUnsafe(16)
        const encrypted = tea.encrypt(data, key)
        const decrypted = tea.decrypt(encrypted, key)
    }
    console.timeEnd(label)
}

console.log("--tea performance test (50MB) begin--")

runEncrypt(50, 1e6)
runEncryptWithDecrypt(50, 1e6)
runEncrypt(500, 1e5)
runEncryptWithDecrypt(500, 1e5)
runEncrypt(5000, 1e4)
runEncryptWithDecrypt(5000, 1e4)
runEncrypt(50000, 1e3)
runEncryptWithDecrypt(50000, 1e3)

console.log("--tea performance test (50MB) end--\n")
