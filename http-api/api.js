"use strict";
/**
 * @type {import("../").Client}
 */
let bot;
class NotFoundError extends Error {}

const available_actions = [
    "sendPrivateMsg",
    "sendGroupMsg",
    "sendDiscussMsg",
    "sendMsg",
    "deleteMsg",
    "getMsg",
    "getForwardMsg",
    "sendLike",
    "setGroupKick",
    "setGroupBan",
    "setGroupAnonymousBan",
    "setGroupWholeBan",
    "setGroupAdmin",
    "setGroupAnonymous",
    "setGroupCard",
    "setGroupName",
    "setGroupLeave",
    "sendGroupNotice",
    "setGroupSpecialTitle",
    "setFriendAddRequest",
    "setGroupAddRequest",
    "getLoginInfo",
    "getStrangerInfo",
    "getFriendList",
    "getStrangerList",
    "getGroupInfo",
    "getGroupList",
    "getGroupMemberInfo",
    "getGroupMemberList",
    // "getGroupHonorInfo", //暂无实现计划
    "getCookies",
    "getCsrfToken",
    // "getCredentials", //暂无实现计划
    // "getRecord", //暂无实现计划
    // "getImage", //暂无实现计划
    "canSendImage",
    "canSendRecord",
    "getStatus",
    "getVersionInfo",
    // "setRestart", //todo
    "cleanCache",

    //enhancement
    "setOnlineStatus",
    "sendGroupPoke",
    "addGroup",
    "addFriend",
    "deleteFriend",
    "inviteFriend",
    "sendLike",
    "setNickname",
    "setDescription",
    "setGender",
    "setBirthday",
    "setSignature",
    "setPortrait",
    "setGroupPortrait",

    "getSystemMsg",
    "getChatHistory",
    "sendTempMsg",
];

const queue = [];
let queue_running = false;
let rate_limit_interval = 500;
async function runQueue() {
    if (queue_running) return;
    while (queue.length > 0) {
        queue_running = true;
        const task = queue.shift();
        const {action, param_arr} = task;
        bot[action].apply(bot, param_arr);
        await new Promise((resolve)=>{
            setTimeout(resolve, rate_limit_interval);
        });
        queue_running = false;
    }
}

const fn_signs = {};

/**
 * @param {{import("../").Client}} client 
 * @param {number} rli rate_limit_interval
 */
function setBot(client, rli) {
    bot = client;
    rli = parseInt(rli);
    if (isNaN(rli) || rli < 0)
        rli = 500;
    rate_limit_interval = rli;
    for (let fn of available_actions) {
        if (bot[fn]) {
            fn_signs[fn] = bot[fn].toString().match(/\(.*\)/)[0].replace("(","").replace(")","").split(",");
            fn_signs[fn].forEach((v, i, arr)=>{
                arr[i] = v.replace(/=.+/, "").trim();
            });
        }
    }
}

function toHump(action) {
    return action.replace(/_[\w]/g, (s)=>{
        return s[1].toUpperCase();
    })
}

function quickOperate(event, res) {
    if (event.post_type === "message" && res.reply) {
        const action = event.message_type === "private" ? "sendPrivateMsg" : "sendGroupMsg";
        const id = event.message_type === "private" ? event.user_id : event.group_id;
        bot[action](id, res.reply, res.auto_escape);
        if (event.group_id) {
            if (res.delete)
                bot.deleteMsg(event.message_id);
            if (res.kick && !event.anonymous)
                bot.setGroupKick(event.group_id, event.user_id, res.reject_add_request);
            if (res.ban)
                bot.setGroupBan(event.group_id, event.user_id, res.ban_duration?res.ban_duration:1800);
        }
    }
    if (event.post_type === "request" && res.hasOwnProperty("approve")) {
        const action = event.request_type === "friend" ? "setFriendAddRequest" : "setGroupAddRequest";
        bot[action](event.flag, res.approve, res.reason?res.reason:"", res.block?true:false);
    }
}

function handleQuickOperation(data) {
    const event = data.params.context, res = data.params.operation;
    quickOperate(event, res);
}

const bool_fields = ["no_cache", "auto_escape", "as_long", "enable", "reject_add_request", "is_dismiss", "approve", "block"];
function toBool(v) {
    if (v === "0" || v === "false")
        v = false;
    return Boolean(v);
}

async function apply(req) {
    let {action, params, echo} = req;
    let is_async = action.includes("_async");
    if (is_async)
        action = action.replace("_async", "");
    let is_queue = action.includes("_rate_limited");
    if (is_queue)
        action = action.replace("_rate_limited", "");

    if (action === "send_msg") {
        if (["private", "group", "discuss"].includes(params.message_type))
            action = "send_" + params.message_type + "_msg";
        else if (params.user_id)
            action = "send_private_msg";
        else if (params.group_id)
            action = "send_group_msg";
        else if (params.discuss_id)
            action = "send_discuss_msg";
    }

    action = toHump(action);
    if (bot[action] && available_actions.includes(action)) {

        const param_arr = [];
        for (let k of fn_signs[action]) {
            if (Reflect.has(params, k)) {
                if (bool_fields.includes(k))
                    params[k] = toBool(params[k]);
                param_arr.push(params[k]);
            }
        }

        let ret;
        if (is_queue) {
            queue.push({action, param_arr});
            runQueue();
            ret = {
                retcode: 1,
                status: "async",
                data: null
            }
        } else {
            ret = bot[action].apply(bot, param_arr);
            if (ret instanceof Promise) {
                if (is_async)
                    ret = {
                        retcode: 1,
                        status: "async",
                        data: null
                    }
                else
                    ret = await ret;
            }
        }

        if (ret.data instanceof Map)
            ret.data = [...ret.data.values()];

        if (echo)
            ret.echo = echo;
        return JSON.stringify(ret);
    } else {
        throw new NotFoundError();
    }
}

module.exports = {
    setBot, quickOperate, handleQuickOperation, apply, NotFoundError
}
