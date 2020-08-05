"use strict"
const Events = require("events")

const STATUS = {
    OFFLINE: Symbol("OFFLINE"),
    CONNECTING: Symbol("CONNECTING"),
    RECONNECTING: Symbol("RECONNECTING"),
    ONLINE: Symbol("ONLINE"),
}

class Bot extends Events {
    constructor(account, password, config = {}) {
        this.status = STATUS.OFFLINE
        this.on("login", ()=>{

        })
    }
    login() {
        if (this.status !== STATUS.OFFLINE)
            return
    }
    logout() {

    }
    isOnline() {
        return this.status === STATUS.ONLINE
    }
    getFriendList() {}
    getGroupList() {}
}
