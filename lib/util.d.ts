import { OutgoingHttpHeaders } from "http"
import * as T from "./message"

export namespace segment {
	/** @deprecated 建议直接使用字符串 */
	function text(text: string): T.TextElem
	/** AT */
	function at(qq: number | "all", text?: string, dummy?: boolean): T.AtElem
	/** 经典表情(id=0~324) */
	function face(id: number): T.FaceElem
	/** 小表情(id规则不明) */
	function sface(id: number, text?: string): T.FaceElem
	/** 原创表情(file规则不明) */
	function bface(file: string): T.BfaceElem
	/** 猜拳(id=1~3) */
	function rps(id?: number): T.MfaceElem
	/** 骰子(id=1~6) */
	function dice(id?: number): T.MfaceElem
	/** 图片(支持http://,base64://) */
	function image(file: T.ImageElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): T.ImageElem
	/** 闪照(支持http://,base64://) */
	function flash(file: T.FlashElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): T.FlashElem
	/** 语音(支持http://,base64://) */
	function record(file: string | Buffer): T.PttElem
	/** 视频(仅支持本地文件) */
	function video(file: string): T.VideoElem
	/** 位置分享 */
	function location(lat: number, lng: number, address: string, id?: string): T.LocationElem
	/** JSON消息 */
	function json(data: any): T.JsonElem
	/** XML消息 */
	function xml(data: string, type?: number): T.XmlElem
	/** 内容分享 */
	function share(url: string, title: string, image?: string, content?: string): T.ShareElem
	/** 戳一戳 */
	function poke(type: number, id?: number): T.PokeElem
	/** 特殊消息 */
	function mirai(data: string): T.MiraiElem
	/** @deprecated 将CQ码转换为消息链 */
	function fromCqcode(cqcode: string): T.MessageElem[]
}
