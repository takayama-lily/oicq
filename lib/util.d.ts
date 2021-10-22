import { OutgoingHttpHeaders } from "http"
import * as T from "./message"

export const segment: {
	/** TEXT */
	text(text: string): T.TextElem;
	/** AT */
	at(qq: number, text?: string, dummy?: boolean): T.AtElem
	/** 经典表情 */
	face(id: number, text?: string): T.FaceElem
	/** 小表情 */
	sface(id: number, text?: string): T.FaceElem
	/** 原创表情 */
	bface(file: string): T.BfaceElem
	/** 猜拳 */
	rps(id?: number): T.MfaceElem
	/** 骰子 */
	dice(id?: number): T.MfaceElem
	/** 图片(后三个参数在下载网络图片时有效) */
	image(file: T.ImageElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): T.ImageElem
	/** 闪照(后三个参数在下载网络图片时有效) */
	flash(file: T.FlashElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): T.FlashElem
	/** 语音 */
	record(file: T.PttElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): T.PttElem
	/** 视频 */
	video(file: T.VideoElem["file"]): T.VideoElem
	/** 位置分享 */
	location(lat: number, lng: number, address: string, id?: string): T.LocationElem
	/** JSON消息 */
	json(data: any): T.JsonElem
	/** XML消息 */
	xml(data: string, type?: number): T.XmlElem
	/** 内容分享 */
	share(url: string, title: string, image?: string, content?: string): T.ShareElem
	/** 戳一戳 */
	poke(type: number, id?: number): T.PokeElem
	/** 特殊消息 */
	mirai(data: string): T.MiraiElem
	/** 将从CQ码转换到消息链 */
	fromCqcode(cqcode: string): T.MessageElem[]
}