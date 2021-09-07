"use strict";
// 此文件必须名为config.js才能生效哦

module.exports = {

    //通用配置
    general: {
        platform:           1,       //1:安卓手机 2:aPad 3:安卓手表 4:MacOS 5:iPad
        log_level:          "info",  //trace,debug,info,warn,error,mark
        use_cqhttp_notice:  false,   //是否使用cqhttp标准的notice事件格式

        host:               "0.0.0.0",  //监听主机名
        port:               5700,       //端口
        use_http:           false,      //启用http
        use_ws:             false,      //启用正向ws，和http使用相同地址和端口
        access_token:       "",         //访问api的token
        secret:             "",         //上报数据的sha1签名密钥
        post_timeout:       30,         //post超时时间(秒)
        post_message_format:"array",    //"string"或"array"
        enable_cors:        false,      //是否允许跨域请求
        enable_heartbeat:   false,      //是否启用ws心跳
        heartbeat_interval: 15000,      //ws心跳间隔(毫秒)
        rate_limit_interval:500,        //使用_rate_limited后缀限速调用api的排队间隔时间(毫秒)
        event_filter:       "",         //json格式的事件过滤器文件路径
        post_url: [ //上报地址，可以添加多个url
            // "http://your.address.com:80",
        ],
        ws_reverse_url: [ //反向ws地址，可以添加多个url
            // "ws://your.address.com:8080",
        ],
        ws_reverse_reconnect_interval: 3000, //反向ws断线重连间隔(毫秒)，设为负数直接不重连
        ws_reverse_reconnect_on_code_1000: true, //反向ws是否在关闭状态码为1000的时候重连
    },

    //每个账号的单独配置(用于覆盖通用配置)
    147258369: {

    },
};

// 安全注意：
// 监听0.0.0.0表示监听网卡上的所有地址。如果你的机器可以通过公网ip直接访问，同时你也没有设定access_token，则被认为是极不安全的。
// 你应该知道这样做会导致以下后果：任何人都可以无限制地访问你的Bot的所有API接口。
// 如果只需要在本地访问，建议将监听地址改为localhost。需要通过公网访问，你最好设定access_token。
