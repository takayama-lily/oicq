"use strict";
const codes = {
    RESPONSE_TIMEOUT: "response.error.timeout",
    COMMAND_NAME_UNKNOWN: "command.error.unknown",

    LOGIN_IMAGE_CAPTCHA: "login.notice.captcha",
    LOGIN_VERIFY_URL: "login.notice.device",
    LOGIN_DEVICE_LOCK: "login.info.unlocked",
    LOGIN_SLIDER_CAPTCHA: "login.error.slider",
    LOGIN_OTHER_ERROR: "login.error.other",
    LOGIN_UNKNOWN_ERROR: "login.error.unknown",
};
module.exports = {
    codes
};
