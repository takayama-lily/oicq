"use strict"
const Client = require("./client")

class Bot extends Client {
    constructor(account, password, config = {}) {
        super()
    }
    start() {
        this.login()
    }
    shutdown() {
        this.destroy()
    }
    isOnline() {
        return this.status === Client.ONLINE
    }
}
