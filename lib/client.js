"use strict"
const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

socket.on('error', (err) => {
  console.log(`服务器异常：\n${err.stack}`);
  server.close();
});

socket.on('message', (msg, rinfo) => {
  console.log(`服务器接收到来自 ${rinfo.address}:${rinfo.port} 的 ${msg}`);
});

socket.on('listening', () => {
  const address = socket.address();
  console.log(`服务器监听 ${address.address}:${address.port}`);
  let buf = Buffer.from([2])
  console.log(buf)
  socket.send(buf, 8080, "125.94.60.146")
});

socket.bind();