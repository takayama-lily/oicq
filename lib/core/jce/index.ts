import * as jce from "./jce.lib"

export function decodeWrapper(blob: Buffer) {
	const wrapper = jce.decode(blob)
	const map = jce.decode(wrapper[7])[0]
	let nested = map[Object.keys(map)[0]]
	if (nested instanceof Buffer === false)
		nested = nested[Object.keys(nested)[0]]
	return jce.decode(nested)[0]
}

export function encodeWrapper(map: {[k: string]: Buffer}, servant: string, func: string, reqid = 0) {
	return jce.encode([
		null,
		3, 0,
		0, reqid,
		servant, func,
		jce.encode([map]), 0,
		{ }, { },
	])
}

export function encodeStruct(nested: jce.JceObject) {
	return jce.encode([jce.encodeNested(nested)])
}

export * from "./jce.lib"
