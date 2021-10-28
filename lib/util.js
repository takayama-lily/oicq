"use strict"

const segment = { }
const map = {
	text: ["text"],
	at: ["qq", "text", "dummy"],
	face: ["id"],
	sface: ["id", "text"],
	bface: ["file", "text"],
	rps: ["id"],
	dice: ["id"],
	image: ["file", "cache", "timeout", "headers"],
	flash: ["file", "cache", "timeout", "headers"],
	record: ["file", "cache", "timeout", "headers"],
	video: ["file"],
	location: ["lat", "lng", "address", "id"],
	json: ["data"],
	xml: ["data", "id"],
	share: ["url", "title", "image", "content"],
	poke: ["id"],
	mirai: ["data"],
}

for (const [type, params] of Object.entries(map)) {
	segment[type] = (...args) => {
		const elem = { type }
		for (let i = 0; i < params.length; ++i) {
			if (Reflect.has(args, i)) {
				elem[params[i]] = args[i]
			}
		}
		return elem
	}
}

function unescapeCQ(s) {
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}
function unescapeCQInside(s) {
	if (s === "&#44;") return ","
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}
function qs(s, sep = ",", equal = "=") {
	const ret = { }
	const split = s.split(sep)
	for (let v of split) {
		const i = v.indexOf(equal)
		if (i === -1) continue
		ret[v.substring(0, i)] = v.substr(i + 1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside)
	}
	for (let k in ret) {
		try {
			if (k !== "text")
				ret[k] = JSON.parse(ret[k])
		} catch { }
	}
	return ret
}
function fromCqcode(str) {
	const elems = []
	const res = str.matchAll(/\[CQ:[^\]]+\]/g)
	let prev_index = 0
	for (let v of res) {
		const text = str.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
		if (text)
			elems.push({ type: "text", text })
		const element = v[0]
		let cq = element.replace("[CQ:", "type=")
		cq = cq.substr(0, cq.length - 1)
		elems.push(qs(cq))
		prev_index = v.index + element.length
	}
	if (prev_index < str.length) {
		const text = str.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ)
		if (text)
			elems.push({ type: "text", text })
	}
	return elems
}

segment.fromCqcode = fromCqcode

module.exports.segment = segment
