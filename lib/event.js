"use strict";

/**
 * 事件冒泡传递
 */
function emit(o, name, data = {}) {
    const slice = name.split(".");
    const post_type = slice[0], sub_type = slice[2];
    const param = {
        self_id:    o.uin,
        time:       parseInt(Date.now()/1000),
        post_type:  post_type
    };
    const type_name = slice[0] + "_type";
    param[type_name] = slice[1];
    if (sub_type)
        param.sub_type = sub_type;
    Object.assign(param, data);
    const lv2_event = post_type + "." + slice[1];
    if (o.listenerCount(name))
        o.emit(name, param);
    else if (o.listenerCount(lv2_event))
        o.emit(lv2_event, param);
    else
        o.emit(post_type, param);
}

module.exports = {
    emit
}
