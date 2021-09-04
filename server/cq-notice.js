"use strict";
/**
 * @param {import("oicq").FriendNoticeEventData | import("oicq").GroupNoticeEventData} data 
 */
module.exports = function(data) {
    if (data.sub_type === "poke") {
        data.notice_type = "notify";
        data.target_id = data.user_id;
        data.user_id = data.operator_id;
        data.operator_id = undefined;
        return;
    }
    if (data.notice_type === "friend") {
        if (data.sub_type === "increase")
            data.sub_type = undefined, data.notice_type = "friend_add";
        else if (data.sub_type === "recall")
            data.sub_type = undefined, data.notice_type = "friend_recall";
    } else if (data.notice_type === "group") {
        if (data.sub_type === "increase") {
            data.sub_type = undefined, data.notice_type = "group_increase";
        } else if (data.sub_type === "decrease") {
            data.notice_type = "group_decrease";
            if (data.operator_id === data.user_id)
                data.sub_type = "leave";
            else if (data.self_id === data.user_id)
                data.sub_type = "kick_me";
            else
                data.sub_type = "kick";
        } else if (data.sub_type === "recall") {
            data.sub_type = undefined, data.notice_type = "group_recall";
        } else if (data.sub_type === "ban") {
            data.notice_type = "group_ban";
            data.sub_type = data.duration ? "ban" : "lift_ban";
        } else if (data.sub_type === "admin") {
            data.notice_type = "group_admin";
            data.sub_type = data.set ? "set" : "unset";
        }
    }
};
