// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as oicq from '../index';

//////////

export interface DeviceVersion {
    incremental: string;
    release: string;
    codename: string;
    sdk: number;
}
export interface Device {
    display: string;
    product: string;
    device: string;
    board: string;
    brand: string;
    model: string;
    bootloader: string;
    fingerprint: string;
    boot_id: string;
    proc_version: string;
    baseband: string;
    sim: string;
    os_type: string;
    mac_address: string;
    ip_address: string;
    wifi_bssid: string;
    wifi_ssid: string;
    imei: string;
    android_id: string;
    apn: string;
    version: DeviceVersion;
    imsi: Buffer;
    tgtgt: Buffer;
    guid: Buffer;
}

export interface Sig {
    srm_token: Buffer,
    tgt: Buffer,
    tgt_key: Buffer,
    st_key: Buffer,
    st_web_sig: Buffer,
    skey: Buffer,
    d2: Buffer,
    d2key: Buffer,
    sig_key: Buffer,
    ticket_key: Buffer,
    device_token?: Buffer,
    emp_time: number,
}

export interface ApkInfo {
    id: string,
    name: string,
    version: string,
    ver: string,
    sign: Buffer,
    buildtime: number,
    appid: number,
    subid: number,
    bitmap: number,
    sigmap: number,
    sdkver: string,
}

export type ProtocolResponse = Promise<{
    result: number,
    emsg?: string,
    data?: any,
}>

export interface HighwayUploadObject {
    buf: Buffer,
    md5: Buffer,
    key: Buffer,
}

export interface Proto {
    [k: number]: Proto,
    raw: Buffer,
}

export interface Msg extends Proto {
    1: MsgHead,
    2: MsgContent,
    3: MsgBody,
}

export interface MsgHead extends Proto {
    1: number, //from uin
    2: number, //to uin
    3: number, //type
    4: bigint, //uuid
    5: number, //seqid
    6: number, //time
    7: bigint, //uuid
    8: { //routing
        4: number //group_id
    },
    9: {
        1: number, //group_id
        4: Proto, //card
        8: Proto, //group_name
    },
    10: number, //appid
    13: {
        1: number, //disscus_id
        4: Proto, //card
        5: Proto, //disscus_name
    },
}

export interface MsgContent extends Proto {
    1: number, //pkt cnt
    2: number, //pkt index
    3: number, //div
    4: number, //auto reply
}

export interface MsgBody extends Proto {
    1: RichMsg,
    2: Proto, //离线文件
}

export interface RichMsg extends Proto {
    1: MsgAttr,
    2: Proto[], //common
    4: Proto, //ptt
}

export interface MsgAttr extends Proto {
    2: number, //time
    3: number, //random integer
    9: Proto, //font
}

//////////

export class Client extends oicq.Client {
    logining: boolean;
    status: Symbol;

    fl: Map<number, oicq.FriendInfo>;
    sl: Map<number, oicq.StrangerInfo>;
    gl: Map<number, oicq.GroupInfo>;
    gml: Map<number, Map<number, oicq.MemberInfo>>;

    apk: ApkInfo;
    ksid: string | Buffer;
    device: Device;

    heartbeat: NodeJS.Timeout | null;
    seq_id: number;
    handlers: Map<number, (buf: Buffer) => void>;
    seq_cache: Map<number, Set<string>>;

    session_id: Buffer;
    random_key: Buffer;
    captcha_sign?: Buffer;
    t104?: Buffer;
    t106: Buffer;
    t174?: Buffer;
    phone?: string;
    t402?: Buffer;
    t403?: Buffer;

    sync_finished: boolean;
    sync_cookie: Buffer;
    const1: number;
    const2: number;
    const3: number;

    sig: Sig;
    cookies: object;

    roaming_stamp: string[];

    nextSeq(): number;
    send(): Promise<Buffer>;
    sendOidb(cmd: string, body: Buffer): Promise<Buffer>;
    sendUni(cmd: string, body: Buffer, seq?: number): Promise<Buffer>;
    writeUni(cmd: string, body: Buffer, seq?: number): void;
    useProtocol(fn: Function, params: any[]): oicq.RetCommon;
    em(name: string, data: object): void;
    msgExists(from: number, type: number, seq: number, time: number): boolean;
    buildSyncCookie(): Buffer;
    parseEventType(name: string): oicq.CommonEventData;
}

export * from '../index';
