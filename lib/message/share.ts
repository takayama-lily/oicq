
/**所有可选参数默认为QQ浏览器 */
export interface ShareConfig {
  appid?: number,
  // style?: number,
  appname?: string,
  /**app签名hash */
  appsign?: string,
}

export interface ShareContent {
  title: string,
  summary?: string,
  /**从消息列表中看到的文字,默认为 "[分享]"+title */
  abstract?: string,
  /**预览图网址, 默认为QQ浏览器图标,似乎对域名有限制 */
  preview?: string,
  /**跳转链接, 没有则发不出 */
  jumpUrl: string,
  musicUrl?: string
}

enum app {
  qq = 100446242,
  mi = 1105414497,
  quark = 1105781586
}


const defaultConfig: Required<ShareConfig> = {
  appid: app.qq,
  // style: 4,//有音乐4 没音乐0
  appname: 'com.tencent.mtt',
  appsign: 'd8391a394d4a179e6fe7bdb8a301258b',
}
/**
 * @param target 目标qq
 * @param bu 0为私聊 1为群聊
 */
export function buildShare(target: number, bu: 0 | 1, content: ShareContent, config: ShareConfig = {}) {
  config = { ...defaultConfig, ...config }
  return {
    1: config.appid,
    2: 1,
    3: content.musicUrl ? 4 : 0,
    5: {
      1: 1,
      2: "0.0.0",
      3: config.appname,
      4: config.appsign
    },
    10: bu,
    11: target,
    12: {
      10: content.title,
      11: content.summary,
      12: content.abstract,
      13: content.jumpUrl,
      14: content.preview /* ?? 'https://tangram-1251316161.file.myqcloud.com/files/20210721/e50a8e37e08f29bf1ffc7466e1950690.png' */,
      16: content.musicUrl,
    }
  }
}