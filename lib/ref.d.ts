// Project: https://github.com/takayama-lily/oicq

/// <reference types="node" />

import * as oicq from '../client';

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
    logining: boolean;
    status: Symbol;

    apk: ApkInfo;
    ksid: string | Buffer;
    device: Device;

    recv_timestamp: number;
    send_timestamp: number;
    heartbeat: NodeJS.Timeout | null;
    seq_id: number;
    handlers: Map<number, (buf: Buffer) => void>;
    seq_cache: Map<number, Set<string>>;

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

    sig: Sig;
    cookies: object;

    nextSeq(): number;
    send(): Promise<Buffer>;
    sendUNI(cmd: string, body: Buffer, seq?: number): Promise<Buffer>;
    writeUNI(cmd: string, body: Buffer, seq?: number): void;
    useProtocol(fn: Function, params: any[]): oicq.RetCommon;
    em(name: string, data: object): void;
    msgExists(from: number, type: number, seq: number, time: number): boolean;
}
