// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as oicq from '../client';
import * as log4js from 'log4js';

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
}

export interface ProtocolResponse {
    result: number,
    emsg?: string,
    data?: any,
}

export interface HighwayUploadObject {
    buf: Buffer,
    md5: Buffer,
    key: Buffer,
}

//////////

export class Client extends oicq.Client {
    logger: log4js.Logger;
    ignore_self: boolean;
    reconn_flag: boolean;
    config: oicq.ConfBot;
    status: Symbol;
    kickoff_reconn: boolean;

    apkid: string;
    apkver: string;
    apkname: string;
    apksign: Buffer;
    buildtime: number;
    appid: number;
    sub_appid: number;
    bitmap: number;
    sigmap: number;
    sdkver: string;
    ksid: string | Buffer;
    device: Device;
    
    uin: number;
    password_md5: Buffer;
    nickname: string;
    age: number;
    sex: string;
    online_status: number;
    fl: Map<number, oicq.FriendInfo>;
    sl: Map<number, oicq.StrangerInfo>;
    gl: Map<number, oicq.GroupInfo>;
    gml: Map<number, Map<number, oicq.MemberInfo>>;

    recv_timestamp: number;
    send_timestamp: number;
    heartbeat: NodeJS.Timeout | null;
    seq_id: number;
    handlers: Map<number, (Buffer) => void>;
    seq_cache: Map<number, number>;
    notify33cache: Set<BigInt>;

    session_id: Buffer;
    random_key: Buffer;
    captcha_sign?: Buffer;
    t104?: Buffer;
    t402?: Buffer;
    t403?: Buffer;

    sync_finished: boolean;
    sync_cookie: Buffer;
    const1: number;
    const2: number;
    const3: number;

    dir: string;
    sig: Sig;
    cookies: object;
    msg_times: number[];

    nextSeq(): number;
    send(): Promise<Buffer>;
    sendUNI(cmd: string, body: Buffer, seq?: number): Promise<Buffer>;
    writeUNI(cmd: string, body: Buffer, seq?: number): void;
    useProtocol(fn: Function, params: any[]): oicq.RetCommon;
    em(name: string, data: object): void;
}
