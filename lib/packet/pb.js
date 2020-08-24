/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/light");

var $root = ($protobuf.roots["default"] || ($protobuf.roots["default"] = new $protobuf.Root()))
.addJSON({
  DelImgReq: {
    fields: {
      srcUin: {
        type: "int64",
        id: 1
      },
      dstUin: {
        type: "int64",
        id: 2
      },
      reqTerm: {
        type: "int32",
        id: 3
      },
      reqPlatformType: {
        type: "int32",
        id: 4
      },
      buType: {
        type: "int32",
        id: 5
      },
      buildVer: {
        type: "bytes",
        id: 6
      },
      fileResid: {
        type: "bytes",
        id: 7
      },
      picWidth: {
        type: "int32",
        id: 8
      },
      picHeight: {
        type: "int32",
        id: 9
      }
    }
  },
  DelImgRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      failMsg: {
        type: "bytes",
        id: 2
      },
      fileResid: {
        type: "bytes",
        id: 3
      }
    }
  },
  GetImgUrlReq: {
    fields: {
      srcUin: {
        type: "int64",
        id: 1
      },
      dstUin: {
        type: "int64",
        id: 2
      },
      fileResid: {
        type: "bytes",
        id: 3
      },
      urlFlag: {
        type: "int32",
        id: 4
      },
      urlType: {
        type: "int32",
        id: 6
      },
      reqTerm: {
        type: "int32",
        id: 7
      },
      reqPlatformType: {
        type: "int32",
        id: 8
      },
      srcFileType: {
        type: "int32",
        id: 9
      },
      innerIp: {
        type: "int32",
        id: 10
      },
      boolAddressBook: {
        type: "bool",
        id: 11
      },
      buType: {
        type: "int32",
        id: 12
      },
      buildVer: {
        type: "bytes",
        id: 13
      },
      picUpTimestamp: {
        type: "int32",
        id: 14
      },
      reqTransferType: {
        type: "int32",
        id: 15
      }
    }
  },
  GetImgUrlRsp: {
    fields: {
      fileResid: {
        type: "bytes",
        id: 1
      },
      clientIp: {
        type: "int32",
        id: 2
      },
      result: {
        type: "int32",
        id: 3
      },
      failMsg: {
        type: "bytes",
        id: 4
      },
      bytesThumbDownUrl: {
        type: "bytes",
        id: 5
      },
      bytesOriginalDownUrl: {
        type: "bytes",
        id: 6
      },
      msgImgInfo: {
        type: "D352ImgInfo",
        id: 7
      },
      uint32DownIp: {
        rule: "repeated",
        type: "int32",
        id: 8
      },
      uint32DownPort: {
        rule: "repeated",
        type: "int32",
        id: 9
      },
      thumbDownPara: {
        type: "bytes",
        id: 10
      },
      originalDownPara: {
        type: "bytes",
        id: 11
      },
      downDomain: {
        type: "bytes",
        id: 12
      },
      bytesBigDownUrl: {
        type: "bytes",
        id: 13
      },
      bigDownPara: {
        type: "bytes",
        id: 14
      },
      bigThumbDownPara: {
        type: "bytes",
        id: 15
      },
      httpsUrlFlag: {
        type: "int32",
        id: 16
      },
      msgDownIp6: {
        rule: "repeated",
        type: "IPv6Info",
        id: 26
      },
      clientIp6: {
        type: "bytes",
        id: 27
      }
    }
  },
  D352ImgInfo: {
    fields: {
      fileMd5: {
        type: "bytes",
        id: 1
      },
      fileType: {
        type: "int32",
        id: 2
      },
      fileSize: {
        type: "int64",
        id: 3
      },
      fileWidth: {
        type: "int32",
        id: 4
      },
      fileHeight: {
        type: "int32",
        id: 5
      },
      fileFlag: {
        type: "int64",
        id: 6
      },
      fileCutPos: {
        type: "int32",
        id: 7
      }
    }
  },
  IPv6Info: {
    fields: {
      ip6: {
        type: "bytes",
        id: 1
      },
      port: {
        type: "int32",
        id: 2
      }
    }
  },
  ReqBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      msgTryupImgReq: {
        rule: "repeated",
        type: "D352TryUpImgReq",
        id: 2
      },
      msgGetimgUrlReq: {
        rule: "repeated",
        type: "GetImgUrlReq",
        id: 3
      },
      msgDelImgReq: {
        rule: "repeated",
        type: "DelImgReq",
        id: 4
      },
      netType: {
        type: "int32",
        id: 10
      }
    }
  },
  RspBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      msgTryupImgRsp: {
        rule: "repeated",
        type: "TryUpImgRsp",
        id: 2
      },
      msgGetimgUrlRsp: {
        rule: "repeated",
        type: "GetImgUrlRsp",
        id: 3
      },
      boolNewBigchan: {
        type: "bool",
        id: 4
      },
      msgDelImgRsp: {
        rule: "repeated",
        type: "DelImgRsp",
        id: 5
      },
      failMsg: {
        type: "string",
        id: 10
      }
    }
  },
  D352TryUpImgReq: {
    fields: {
      srcUin: {
        type: "int32",
        id: 1
      },
      dstUin: {
        type: "int32",
        id: 2
      },
      fileId: {
        type: "int32",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      fileSize: {
        type: "int32",
        id: 5
      },
      filename: {
        type: "string",
        id: 6
      },
      srcTerm: {
        type: "int32",
        id: 7
      },
      platformType: {
        type: "int32",
        id: 8
      },
      innerIP: {
        type: "int32",
        id: 9
      },
      addressBook: {
        type: "int32",
        id: 10
      },
      retry: {
        type: "int32",
        id: 11
      },
      buType: {
        type: "int32",
        id: 12
      },
      imgOriginal: {
        type: "int32",
        id: 13
      },
      imgWidth: {
        type: "int32",
        id: 14
      },
      imgHeight: {
        type: "int32",
        id: 15
      },
      imgType: {
        type: "int32",
        id: 16
      },
      buildVer: {
        type: "string",
        id: 17
      },
      fileIndex: {
        type: "bytes",
        id: 18
      },
      fileStoreDays: {
        type: "int32",
        id: 19
      },
      stepFlag: {
        type: "int32",
        id: 20
      },
      rejectTryFast: {
        type: "int32",
        id: 21
      },
      srvUpload: {
        type: "int32",
        id: 22
      },
      transferUrl: {
        type: "bytes",
        id: 23
      }
    }
  },
  TryUpImgRsp: {
    fields: {
      fileId: {
        type: "int64",
        id: 1
      },
      clientIp: {
        type: "int32",
        id: 2
      },
      result: {
        type: "int32",
        id: 3
      },
      failMsg: {
        type: "string",
        id: 4
      },
      boolFileExit: {
        type: "bool",
        id: 5
      },
      msgImgInfo: {
        type: "D352ImgInfo",
        id: 6
      },
      uint32UpIp: {
        rule: "repeated",
        type: "int32",
        id: 7
      },
      uint32UpPort: {
        rule: "repeated",
        type: "int32",
        id: 8
      },
      upUkey: {
        type: "bytes",
        id: 9
      },
      upResid: {
        type: "string",
        id: 10
      },
      upUuid: {
        type: "string",
        id: 11
      },
      upOffset: {
        type: "int64",
        id: 12
      },
      blockSize: {
        type: "int64",
        id: 13
      },
      encryptDstip: {
        type: "bytes",
        id: 14
      },
      roamdays: {
        type: "int32",
        id: 15
      },
      msgUpIp6: {
        rule: "repeated",
        type: "IPv6Info",
        id: 26
      },
      clientIp6: {
        type: "bytes",
        id: 27
      },
      thumbDownPara: {
        type: "bytes",
        id: 60
      },
      originalDownPara: {
        type: "bytes",
        id: 61
      },
      downDomain: {
        type: "bytes",
        id: 62
      },
      bigDownPara: {
        type: "bytes",
        id: 64
      },
      bigThumbDownPara: {
        type: "bytes",
        id: 65
      },
      httpsUrlFlag: {
        type: "int32",
        id: 66
      },
      msgInfo4busi: {
        type: "TryUpInfo4Busi",
        id: 1001
      }
    }
  },
  TryUpInfo4Busi: {
    fields: {
      fileResid: {
        type: "bytes",
        id: 1
      },
      downDomain: {
        type: "bytes",
        id: 2
      },
      thumbDownUrl: {
        type: "bytes",
        id: 3
      },
      originalDownUrl: {
        type: "bytes",
        id: 4
      },
      bigDownUrl: {
        type: "bytes",
        id: 5
      }
    }
  },
  DeviceInfo: {
    fields: {
      bootloader: {
        type: "string",
        id: 1
      },
      procVersion: {
        type: "string",
        id: 2
      },
      codename: {
        type: "string",
        id: 3
      },
      incremental: {
        type: "string",
        id: 4
      },
      fingerprint: {
        type: "string",
        id: 5
      },
      bootId: {
        type: "string",
        id: 6
      },
      androidId: {
        type: "string",
        id: 7
      },
      baseBand: {
        type: "string",
        id: 8
      },
      innerVersion: {
        type: "string",
        id: 9
      }
    }
  },
  RequestBody: {
    fields: {
      rptConfigList: {
        rule: "repeated",
        type: "ConfigSeq",
        id: 1
      }
    }
  },
  ConfigSeq: {
    fields: {
      type: {
        type: "int32",
        id: 1
      },
      version: {
        type: "int32",
        id: 2
      }
    }
  },
  D50ReqBody: {
    fields: {
      appid: {
        type: "int64",
        id: 1
      },
      maxPkgSize: {
        type: "int32",
        id: 2
      },
      startTime: {
        type: "int32",
        id: 3
      },
      startIndex: {
        type: "int32",
        id: 4
      },
      reqNum: {
        type: "int32",
        id: 5
      },
      uinList: {
        rule: "repeated",
        type: "int64",
        id: 6
      },
      reqMusicSwitch: {
        type: "int32",
        id: 91001
      },
      reqMutualmarkAlienation: {
        type: "int32",
        id: 101001
      },
      reqMutualmarkScore: {
        type: "int32",
        id: 141001
      },
      reqKsingSwitch: {
        type: "int32",
        id: 151001
      },
      reqMutualmarkLbsshare: {
        type: "int32",
        id: 181001
      }
    }
  },
  D388ReqBody: {
    fields: {
      netType: {
        type: "int32",
        id: 1
      },
      subcmd: {
        type: "int32",
        id: 2
      },
      msgTryUpImgReq: {
        rule: "repeated",
        type: "TryUpImgReq",
        id: 3
      },
      msgTryUpPttReq: {
        rule: "repeated",
        type: "TryUpPttReq",
        id: 5
      },
      msgGetPttReq: {
        rule: "repeated",
        type: "GetPttUrlReq",
        id: 6
      },
      commandId: {
        type: "int32",
        id: 7
      },
      extension: {
        type: "bytes",
        id: 1001
      }
    }
  },
  D388RespBody: {
    fields: {
      clientIp: {
        type: "int32",
        id: 1
      },
      subCmd: {
        type: "int32",
        id: 2
      },
      msgTryUpImgRsp: {
        rule: "repeated",
        type: "TryUpImgResp",
        id: 3
      },
      msgTryUpPttRsp: {
        rule: "repeated",
        type: "TryUpPttResp",
        id: 5
      },
      msgGetPttUrlRsp: {
        rule: "repeated",
        type: "GetPttUrlRsp",
        id: 6
      }
    }
  },
  GetPttUrlReq: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      dstUin: {
        type: "int64",
        id: 2
      },
      fileId: {
        type: "int64",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      reqTerm: {
        type: "int32",
        id: 5
      },
      reqPlatformType: {
        type: "int32",
        id: 6
      },
      innerIp: {
        type: "int32",
        id: 7
      },
      buType: {
        type: "int32",
        id: 8
      },
      buildVer: {
        type: "bytes",
        id: 9
      },
      fileKey: {
        type: "bytes",
        id: 11
      },
      codec: {
        type: "int32",
        id: 12
      },
      buId: {
        type: "int32",
        id: 13
      },
      reqTransferType: {
        type: "int32",
        id: 14
      },
      isAuto: {
        type: "int32",
        id: 15
      }
    }
  },
  GetPttUrlRsp: {
    fields: {
      fileId: {
        type: "int64",
        id: 1
      },
      fileMd5: {
        type: "bytes",
        id: 2
      },
      result: {
        type: "int32",
        id: 3
      },
      failMsg: {
        type: "bytes",
        id: 4
      },
      bytesDownUrl: {
        type: "bytes",
        id: 5
      },
      uint32DownIp: {
        rule: "repeated",
        type: "int32",
        id: 6
      },
      uint32DownPort: {
        rule: "repeated",
        type: "int32",
        id: 7
      },
      downDomain: {
        type: "bytes",
        id: 8
      },
      downPara: {
        type: "bytes",
        id: 9
      },
      transferType: {
        type: "int32",
        id: 11
      },
      allowRetry: {
        type: "int32",
        id: 12
      },
      clientIp6: {
        type: "bytes",
        id: 27
      },
      strDomain: {
        type: "string",
        id: 28
      }
    }
  },
  ReqDataHighwayHead: {
    fields: {
      msgBasehead: {
        type: "DataHighwayHead",
        id: 1
      },
      msgSeghead: {
        type: "SegHead",
        id: 2
      },
      reqExtendinfo: {
        type: "bytes",
        id: 3
      },
      timestamp: {
        type: "int64",
        id: 4
      }
    }
  },
  RspDataHighwayHead: {
    fields: {
      msgBasehead: {
        type: "DataHighwayHead",
        id: 1
      },
      msgSeghead: {
        type: "SegHead",
        id: 2
      },
      errorCode: {
        type: "int32",
        id: 3
      },
      allowRetry: {
        type: "int32",
        id: 4
      },
      cachecost: {
        type: "int32",
        id: 5
      },
      htcost: {
        type: "int32",
        id: 6
      },
      rspExtendinfo: {
        type: "bytes",
        id: 7
      },
      timestamp: {
        type: "int64",
        id: 8
      },
      range: {
        type: "int64",
        id: 9
      },
      isReset: {
        type: "int32",
        id: 10
      }
    }
  },
  DataHighwayHead: {
    fields: {
      version: {
        type: "int32",
        id: 1
      },
      uin: {
        type: "string",
        id: 2
      },
      command: {
        type: "string",
        id: 3
      },
      seq: {
        type: "int32",
        id: 4
      },
      retryTimes: {
        type: "int32",
        id: 5
      },
      appid: {
        type: "int32",
        id: 6
      },
      dataflag: {
        type: "int32",
        id: 7
      },
      commandId: {
        type: "int32",
        id: 8
      },
      buildVer: {
        type: "string",
        id: 9
      },
      localeId: {
        type: "int32",
        id: 10
      }
    }
  },
  SegHead: {
    fields: {
      serviceid: {
        type: "int32",
        id: 1
      },
      filesize: {
        type: "int64",
        id: 2
      },
      dataoffset: {
        type: "int64",
        id: 3
      },
      datalength: {
        type: "int32",
        id: 4
      },
      rtcode: {
        type: "int32",
        id: 5
      },
      serviceticket: {
        type: "bytes",
        id: 6
      },
      flag: {
        type: "int32",
        id: 7
      },
      md5: {
        type: "bytes",
        id: 8
      },
      fileMd5: {
        type: "bytes",
        id: 9
      },
      cacheAddr: {
        type: "int32",
        id: 10
      },
      queryTimes: {
        type: "int32",
        id: 11
      },
      updateCacheip: {
        type: "int32",
        id: 12
      }
    }
  },
  TryUpImgReq: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      srcUin: {
        type: "int64",
        id: 2
      },
      fileId: {
        type: "int64",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      fileSize: {
        type: "int64",
        id: 5
      },
      fileName: {
        type: "string",
        id: 6
      },
      srcTerm: {
        type: "int32",
        id: 7
      },
      platformType: {
        type: "int32",
        id: 8
      },
      buType: {
        type: "int32",
        id: 9
      },
      picWidth: {
        type: "int32",
        id: 10
      },
      picHeight: {
        type: "int32",
        id: 11
      },
      picType: {
        type: "int32",
        id: 12
      },
      buildVer: {
        type: "string",
        id: 13
      },
      innerIp: {
        type: "int32",
        id: 14
      },
      appPicType: {
        type: "int32",
        id: 15
      },
      originalPic: {
        type: "int32",
        id: 16
      },
      fileIndex: {
        type: "bytes",
        id: 17
      },
      dstUin: {
        type: "int64",
        id: 18
      },
      srvUpload: {
        type: "int32",
        id: 19
      },
      transferUrl: {
        type: "bytes",
        id: 20
      }
    }
  },
  TryUpImgResp: {
    fields: {
      fileId: {
        type: "int64",
        id: 1
      },
      result: {
        type: "int32",
        id: 2
      },
      failMsg: {
        type: "string",
        id: 3
      },
      boolFileExit: {
        type: "bool",
        id: 4
      },
      msgImgInfo: {
        type: "ImgInfo",
        id: 5
      },
      uint32UpIp: {
        rule: "repeated",
        type: "int32",
        id: 6
      },
      uint32UpPort: {
        rule: "repeated",
        type: "int32",
        id: 7
      },
      upUkey: {
        type: "bytes",
        id: 8
      },
      fid: {
        type: "int64",
        id: 9
      }
    }
  },
  TryUpPttReq: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      srcUin: {
        type: "int64",
        id: 2
      },
      fileId: {
        type: "int64",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      fileSize: {
        type: "int64",
        id: 5
      },
      fileName: {
        type: "bytes",
        id: 6
      },
      srcTerm: {
        type: "int32",
        id: 7
      },
      platformType: {
        type: "int32",
        id: 8
      },
      buType: {
        type: "int32",
        id: 9
      },
      buildVer: {
        type: "string",
        id: 10
      },
      innerIp: {
        type: "int32",
        id: 11
      },
      voiceLength: {
        type: "int32",
        id: 12
      },
      boolNewUpChan: {
        type: "bool",
        id: 13
      },
      codec: {
        type: "int32",
        id: 14
      },
      voiceType: {
        type: "int32",
        id: 15
      },
      buId: {
        type: "int32",
        id: 16
      }
    }
  },
  TryUpPttResp: {
    fields: {
      fileId: {
        type: "int64",
        id: 1
      },
      result: {
        type: "int32",
        id: 2
      },
      failMsg: {
        type: "string",
        id: 3
      },
      boolFileExit: {
        type: "bool",
        id: 4
      },
      uint32UpIp: {
        rule: "repeated",
        type: "int32",
        id: 5
      },
      uint32UpPort: {
        rule: "repeated",
        type: "int32",
        id: 6
      },
      upUkey: {
        type: "bytes",
        id: 7
      },
      upOffset: {
        type: "int64",
        id: 9
      },
      blockSize: {
        type: "int64",
        id: 10
      },
      fileKey: {
        type: "bytes",
        id: 11
      },
      channelType: {
        type: "int32",
        id: 12
      }
    }
  },
  ImgInfo: {
    fields: {
      fileMd5: {
        type: "bytes",
        id: 1
      },
      fileType: {
        type: "int32",
        id: 2
      },
      fileSize: {
        type: "int64",
        id: 3
      },
      fileWidth: {
        type: "int32",
        id: 4
      },
      fileHeight: {
        type: "int32",
        id: 5
      }
    }
  },
  DeleteMessageRequest: {
    fields: {
      items: {
        rule: "repeated",
        type: "MessageItem",
        id: 1
      }
    }
  },
  MessageItem: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      msgType: {
        type: "int32",
        id: 3
      },
      msgSeq: {
        type: "int32",
        id: 4
      },
      msgUid: {
        type: "int64",
        id: 5
      },
      sig: {
        type: "bytes",
        id: 7
      }
    }
  },
  NotifyMsgBody: {
    fields: {
      optMsgRecall: {
        type: "MessageRecallReminder",
        id: 11
      },
      serviceType: {
        type: "int32",
        id: 13
      }
    }
  },
  MessageRecallReminder: {
    fields: {
      uin: {
        type: "int64",
        id: 1
      },
      nickname: {
        type: "bytes",
        id: 2
      },
      recalledMsgList: {
        rule: "repeated",
        type: "RecalledMessageMeta",
        id: 3
      },
      reminderContent: {
        type: "bytes",
        id: 4
      },
      userdef: {
        type: "bytes",
        id: 5
      },
      groupType: {
        type: "int32",
        id: 6
      },
      opType: {
        type: "int32",
        id: 7
      }
    }
  },
  RecalledMessageMeta: {
    fields: {
      seq: {
        type: "int32",
        id: 1
      },
      time: {
        type: "int32",
        id: 2
      },
      msgRandom: {
        type: "int32",
        id: 3
      },
      msgType: {
        type: "int32",
        id: 4
      },
      msgFlag: {
        type: "int32",
        id: 5
      },
      authorUin: {
        type: "int64",
        id: 6
      }
    }
  },
  SubD4: {
    fields: {
      uin: {
        type: "int64",
        id: 1
      }
    }
  },
  Sub8A: {
    fields: {
      msgInfo: {
        rule: "repeated",
        type: "Sub8AMsgInfo",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      instId: {
        type: "int32",
        id: 3
      },
      longMessageFlag: {
        type: "int32",
        id: 4
      },
      reserved: {
        type: "bytes",
        id: 5
      }
    }
  },
  Sub8AMsgInfo: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      msgSeq: {
        type: "int32",
        id: 3
      },
      msgUid: {
        type: "int64",
        id: 4
      },
      msgTime: {
        type: "int64",
        id: 5
      },
      msgRandom: {
        type: "int32",
        id: 6
      },
      pkgNum: {
        type: "int32",
        id: 7
      },
      pkgIndex: {
        type: "int32",
        id: 8
      },
      devSeq: {
        type: "int32",
        id: 9
      }
    }
  },
  SubB3: {
    fields: {
      type: {
        type: "int32",
        id: 1
      },
      msgAddFrdNotify: {
        type: "SubB3AddFrdNotify",
        id: 2
      }
    }
  },
  SubB3AddFrdNotify: {
    fields: {
      uin: {
        type: "int64",
        id: 1
      },
      nick: {
        type: "string",
        id: 5
      }
    }
  },
  LongMsgDeleteReq: {
    fields: {
      msgResid: {
        type: "bytes",
        id: 1
      },
      msgType: {
        type: "int32",
        id: 2
      }
    }
  },
  LongMsgDeleteRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      msgResid: {
        type: "bytes",
        id: 2
      }
    }
  },
  LongMsgDownReq: {
    fields: {
      srcUin: {
        type: "int32",
        id: 1
      },
      msgResid: {
        type: "bytes",
        id: 2
      },
      msgType: {
        type: "int32",
        id: 3
      },
      needCache: {
        type: "int32",
        id: 4
      }
    }
  },
  LongMsgDownRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      msgResid: {
        type: "bytes",
        id: 2
      },
      msgContent: {
        type: "bytes",
        id: 3
      }
    }
  },
  LongMsgUpReq: {
    fields: {
      msgType: {
        type: "int32",
        id: 1
      },
      dstUin: {
        type: "int64",
        id: 2
      },
      msgId: {
        type: "int32",
        id: 3
      },
      msgContent: {
        type: "bytes",
        id: 4
      },
      storeType: {
        type: "int32",
        id: 5
      },
      msgUkey: {
        type: "bytes",
        id: 6
      },
      needCache: {
        type: "int32",
        id: 7
      }
    }
  },
  LongMsgUpRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      msgId: {
        type: "int32",
        id: 2
      },
      msgResid: {
        type: "bytes",
        id: 3
      }
    }
  },
  LongReqBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      termType: {
        type: "int32",
        id: 2
      },
      platformType: {
        type: "int32",
        id: 3
      },
      msgUpReq: {
        rule: "repeated",
        type: "LongMsgUpReq",
        id: 4
      },
      msgDownReq: {
        rule: "repeated",
        type: "LongMsgDownReq",
        id: 5
      },
      msgDelReq: {
        rule: "repeated",
        type: "LongMsgDeleteReq",
        id: 6
      },
      agentType: {
        type: "int32",
        id: 10
      }
    }
  },
  LongRspBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      msgUpRsp: {
        rule: "repeated",
        type: "LongMsgUpRsp",
        id: 2
      },
      msgDownRsp: {
        rule: "repeated",
        type: "LongMsgDownRsp",
        id: 3
      },
      msgDelRsp: {
        rule: "repeated",
        type: "LongMsgDeleteRsp",
        id: 4
      }
    }
  },
  GetMessageRequest: {
    fields: {
      syncFlag: {
        type: "SyncFlag",
        id: 1
      },
      syncCookie: {
        type: "bytes",
        id: 2
      },
      rambleFlag: {
        type: "int32",
        id: 3
      },
      latestRambleNumber: {
        type: "int32",
        id: 4
      },
      otherRambleNumber: {
        type: "int32",
        id: 5
      },
      onlineSyncFlag: {
        type: "int32",
        id: 6
      },
      contextFlag: {
        type: "int32",
        id: 7
      },
      whisperSessionId: {
        type: "int32",
        id: 8
      },
      msgReqType: {
        type: "int32",
        id: 9
      },
      pubaccountCookie: {
        type: "bytes",
        id: 10
      },
      msgCtrlBuf: {
        type: "bytes",
        id: 11
      },
      serverBuf: {
        type: "bytes",
        id: 12
      }
    }
  },
  SendMessageRequest: {
    fields: {
      routingHead: {
        type: "RoutingHead",
        id: 1
      },
      contentHead: {
        type: "ContentHead",
        id: 2
      },
      msgBody: {
        type: "MessageBody",
        id: 3
      },
      msgSeq: {
        type: "int32",
        id: 4
      },
      msgRand: {
        type: "int32",
        id: 5
      },
      syncCookie: {
        type: "bytes",
        id: 6
      },
      msgVia: {
        type: "int32",
        id: 8
      },
      dataStatist: {
        type: "int32",
        id: 9
      },
      msgCtrl: {
        type: "MsgCtrl",
        id: 12
      },
      multiSendSeq: {
        type: "int32",
        id: 14
      }
    }
  },
  MsgWithDrawReq: {
    fields: {
      c2cWithDraw: {
        rule: "repeated",
        type: "C2CMsgWithDrawReq",
        id: 1
      },
      groupWithDraw: {
        rule: "repeated",
        type: "GroupMsgWithDrawReq",
        id: 2
      }
    }
  },
  C2CMsgWithDrawReq: {
    fields: {
      msgInfo: {
        rule: "repeated",
        type: "C2CMsgInfo",
        id: 1
      },
      longMessageFlag: {
        type: "int32",
        id: 2
      },
      reserved: {
        type: "bytes",
        id: 3
      },
      subCmd: {
        type: "int32",
        id: 4
      }
    }
  },
  GroupMsgWithDrawReq: {
    fields: {
      subCmd: {
        type: "int32",
        id: 1
      },
      groupType: {
        type: "int32",
        id: 2
      },
      groupCode: {
        type: "int64",
        id: 3
      },
      msgList: {
        rule: "repeated",
        type: "GroupMsgInfo",
        id: 4
      },
      userDef: {
        type: "bytes",
        id: 5
      }
    }
  },
  GroupMsgInfo: {
    fields: {
      msgSeq: {
        type: "int32",
        id: 1
      },
      msgRandom: {
        type: "int32",
        id: 2
      },
      msgType: {
        type: "int32",
        id: 3
      }
    }
  },
  C2CMsgInfo: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      msgSeq: {
        type: "int32",
        id: 3
      },
      msgUid: {
        type: "int64",
        id: 4
      },
      msgTime: {
        type: "int64",
        id: 5
      },
      msgRandom: {
        type: "int32",
        id: 6
      },
      pkgNum: {
        type: "int32",
        id: 7
      },
      pkgIndex: {
        type: "int32",
        id: 8
      },
      divSeq: {
        type: "int32",
        id: 9
      },
      msgType: {
        type: "int32",
        id: 10
      },
      routingHead: {
        type: "RoutingHead",
        id: 20
      }
    }
  },
  RoutingHead: {
    fields: {
      c2c: {
        type: "C2C",
        id: 1
      },
      grp: {
        type: "Grp",
        id: 2
      },
      grpTmp: {
        type: "GrpTmp",
        id: 3
      }
    }
  },
  C2C: {
    fields: {
      toUin: {
        type: "int64",
        id: 1
      }
    }
  },
  Grp: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      }
    }
  },
  GrpTmp: {
    fields: {
      groupUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      }
    }
  },
  MsgCtrl: {
    fields: {
      msgFlag: {
        type: "int32",
        id: 1
      }
    }
  },
  GetMessageResponse: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      errorMessage: {
        type: "string",
        id: 2
      },
      syncCookie: {
        type: "bytes",
        id: 3
      },
      syncFlag: {
        type: "SyncFlag",
        id: 4
      },
      uinPairMsgs: {
        rule: "repeated",
        type: "UinPairMessage",
        id: 5
      },
      bindUin: {
        type: "int64",
        id: 6
      },
      msgRspType: {
        type: "int32",
        id: 7
      },
      pubAccountCookie: {
        type: "bytes",
        id: 8
      },
      isPartialSync: {
        type: "bool",
        id: 9
      },
      msgCtrlBuf: {
        type: "bytes",
        id: 10
      }
    }
  },
  PushMessagePacket: {
    fields: {
      message: {
        type: "Message",
        id: 1
      },
      svrip: {
        type: "int32",
        id: 2
      },
      pushToken: {
        type: "bytes",
        id: 3
      },
      pingFLag: {
        type: "int32",
        id: 4
      },
      generalFlag: {
        type: "int32",
        id: 9
      }
    }
  },
  UinPairMessage: {
    fields: {
      lastReadTime: {
        type: "int32",
        id: 1
      },
      peerUin: {
        type: "int64",
        id: 2
      },
      msgCompleted: {
        type: "int32",
        id: 3
      },
      messages: {
        rule: "repeated",
        type: "Message",
        id: 4
      }
    }
  },
  Message: {
    fields: {
      head: {
        type: "MessageHead",
        id: 1
      },
      content: {
        type: "ContentHead",
        id: 2
      },
      body: {
        type: "MessageBody",
        id: 3
      }
    }
  },
  MessageBody: {
    fields: {
      richText: {
        type: "RichText",
        id: 1
      },
      msgContent: {
        type: "bytes",
        id: 2
      },
      msgEncryptContent: {
        type: "bytes",
        id: 3
      }
    }
  },
  RichText: {
    fields: {
      attr: {
        type: "Attr",
        id: 1
      },
      elems: {
        rule: "repeated",
        type: "Elem",
        id: 2
      },
      notOnlineFile: {
        type: "NotOnlineFile",
        id: 3
      },
      ptt: {
        type: "Ptt",
        id: 4
      }
    }
  },
  Elem: {
    fields: {
      text: {
        type: "Text",
        id: 1
      },
      face: {
        type: "Face",
        id: 2
      },
      onlineImage: {
        type: "OnlineImage",
        id: 3
      },
      notOnlineImage: {
        type: "NotOnlineImage",
        id: 4
      },
      transElemInfo: {
        type: "TransElem",
        id: 5
      },
      customFace: {
        type: "CustomFace",
        id: 8
      },
      richMsg: {
        type: "RichMsg",
        id: 12
      },
      groupFile: {
        type: "GroupFile",
        id: 13
      },
      extraInfo: {
        type: "ExtraInfo",
        id: 16
      },
      videoFile: {
        type: "VideoFile",
        id: 19
      },
      anonGroupMsg: {
        type: "AnonymousGroupMessage",
        id: 21
      },
      customElem: {
        type: "CustomElem",
        id: 31
      },
      generalFlags: {
        type: "GeneralFlags",
        id: 37
      },
      srcMsg: {
        type: "SourceMsg",
        id: 45
      },
      lightApp: {
        type: "LightAppElem",
        id: 51
      }
    }
  },
  RichMsg: {
    fields: {
      template1: {
        type: "bytes",
        id: 1
      },
      serviceId: {
        type: "int32",
        id: 2
      },
      msgResId: {
        type: "bytes",
        id: 3
      },
      rand: {
        type: "int32",
        id: 4
      },
      seq: {
        type: "int32",
        id: 5
      }
    }
  },
  CustomElem: {
    fields: {
      desc: {
        type: "bytes",
        id: 1
      },
      data: {
        type: "bytes",
        id: 2
      },
      enumType: {
        type: "int32",
        id: 3
      },
      ext: {
        type: "bytes",
        id: 4
      },
      sound: {
        type: "bytes",
        id: 5
      }
    }
  },
  Text: {
    fields: {
      str: {
        type: "string",
        id: 1
      },
      link: {
        type: "string",
        id: 2
      },
      attr6Buf: {
        type: "bytes",
        id: 3
      },
      attr7Buf: {
        type: "bytes",
        id: 4
      },
      buf: {
        type: "bytes",
        id: 11
      },
      pbReserve: {
        type: "bytes",
        id: 12
      }
    }
  },
  Attr: {
    fields: {
      codePage: {
        type: "int32",
        id: 1
      },
      time: {
        type: "int32",
        id: 2
      },
      random: {
        type: "int32",
        id: 3
      },
      color: {
        type: "int32",
        id: 4
      },
      size: {
        type: "int32",
        id: 5
      },
      effect: {
        type: "int32",
        id: 6
      },
      charSet: {
        type: "int32",
        id: 7
      },
      pitchAndFamily: {
        type: "int32",
        id: 8
      },
      fontName: {
        type: "string",
        id: 9
      },
      reserveData: {
        type: "bytes",
        id: 10
      }
    }
  },
  Ptt: {
    fields: {
      fileType: {
        type: "int32",
        id: 1
      },
      srcUin: {
        type: "int64",
        id: 2
      },
      fileUuid: {
        type: "bytes",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      fileName: {
        type: "string",
        id: 5
      },
      fileSize: {
        type: "int32",
        id: 6
      },
      reserve: {
        type: "bytes",
        id: 7
      },
      fileId: {
        type: "int32",
        id: 8
      },
      serverIp: {
        type: "int32",
        id: 9
      },
      serverPort: {
        type: "int32",
        id: 10
      },
      boolValid: {
        type: "bool",
        id: 11
      },
      signature: {
        type: "bytes",
        id: 12
      },
      shortcut: {
        type: "bytes",
        id: 13
      },
      fileKey: {
        type: "bytes",
        id: 14
      },
      magicPttIndex: {
        type: "int32",
        id: 15
      },
      voiceSwitch: {
        type: "int32",
        id: 16
      },
      pttUrl: {
        type: "bytes",
        id: 17
      },
      groupFileKey: {
        type: "bytes",
        id: 18
      },
      time: {
        type: "int32",
        id: 19
      },
      downPara: {
        type: "bytes",
        id: 20
      },
      format: {
        type: "int32",
        id: 29
      },
      pbReserve: {
        type: "bytes",
        id: 30
      },
      bytesPttUrls: {
        rule: "repeated",
        type: "bytes",
        id: 31
      },
      downloadFlag: {
        type: "int32",
        id: 32
      }
    }
  },
  OnlineImage: {
    fields: {
      guid: {
        type: "bytes",
        id: 1
      },
      filePath: {
        type: "bytes",
        id: 2
      },
      oldVerSendFile: {
        type: "bytes",
        id: 3
      }
    }
  },
  NotOnlineImage: {
    fields: {
      filePath: {
        type: "string",
        id: 1
      },
      fileLen: {
        type: "int32",
        id: 2
      },
      downloadPath: {
        type: "string",
        id: 3
      },
      oldVerSendFile: {
        type: "bytes",
        id: 4
      },
      imgType: {
        type: "int32",
        id: 5
      },
      previewsImage: {
        type: "bytes",
        id: 6
      },
      picMd5: {
        type: "bytes",
        id: 7
      },
      picHeight: {
        type: "int32",
        id: 8
      },
      picWidth: {
        type: "int32",
        id: 9
      },
      resId: {
        type: "string",
        id: 10
      },
      flag: {
        type: "bytes",
        id: 11
      },
      thumbUrl: {
        type: "string",
        id: 12
      },
      original: {
        type: "int32",
        id: 13
      },
      bigUrl: {
        type: "string",
        id: 14
      },
      origUrl: {
        type: "string",
        id: 15
      },
      bizType: {
        type: "int32",
        id: 16
      },
      result: {
        type: "int32",
        id: 17
      },
      index: {
        type: "int32",
        id: 18
      },
      opFaceBuf: {
        type: "bytes",
        id: 19
      },
      oldPicMd5: {
        type: "bool",
        id: 20
      },
      thumbWidth: {
        type: "int32",
        id: 21
      },
      thumbHeight: {
        type: "int32",
        id: 22
      },
      fileId: {
        type: "int32",
        id: 23
      },
      showLen: {
        type: "int32",
        id: 24
      },
      downloadLen: {
        type: "int32",
        id: 25
      },
      pbReserve: {
        type: "bytes",
        id: 29
      }
    }
  },
  NotOnlineFile: {
    fields: {
      fileType: {
        type: "int32",
        id: 1
      },
      sig: {
        type: "bytes",
        id: 2
      },
      fileUuid: {
        type: "bytes",
        id: 3
      },
      fileMd5: {
        type: "bytes",
        id: 4
      },
      fileName: {
        type: "bytes",
        id: 5
      },
      fileSize: {
        type: "int64",
        id: 6
      },
      note: {
        type: "bytes",
        id: 7
      },
      reserved: {
        type: "int32",
        id: 8
      },
      subcmd: {
        type: "int32",
        id: 9
      },
      microCloud: {
        type: "int32",
        id: 10
      },
      bytesFileUrls: {
        rule: "repeated",
        type: "bytes",
        id: 11
      },
      downloadFlag: {
        type: "int32",
        id: 12
      },
      dangerEvel: {
        type: "int32",
        id: 50
      },
      lifeTime: {
        type: "int32",
        id: 51
      },
      uploadTime: {
        type: "int32",
        id: 52
      },
      absFileType: {
        type: "int32",
        id: 53
      },
      clientType: {
        type: "int32",
        id: 54
      },
      expireTime: {
        type: "int32",
        id: 55
      },
      pbReserve: {
        type: "bytes",
        id: 56
      }
    }
  },
  TransElem: {
    fields: {
      elemType: {
        type: "int32",
        id: 1
      },
      elemValue: {
        type: "bytes",
        id: 2
      }
    }
  },
  ExtraInfo: {
    fields: {
      nick: {
        type: "bytes",
        id: 1
      },
      groupCard: {
        type: "bytes",
        id: 2
      },
      level: {
        type: "int32",
        id: 3
      },
      flags: {
        type: "int32",
        id: 4
      },
      groupMask: {
        type: "int32",
        id: 5
      },
      msgTailId: {
        type: "int32",
        id: 6
      },
      senderTitle: {
        type: "bytes",
        id: 7
      },
      apnsTips: {
        type: "bytes",
        id: 8
      },
      uin: {
        type: "int64",
        id: 9
      },
      msgStateFlag: {
        type: "int32",
        id: 10
      },
      apnsSoundType: {
        type: "int32",
        id: 11
      },
      newGroupFlag: {
        type: "int32",
        id: 12
      }
    }
  },
  GroupFile: {
    fields: {
      filename: {
        type: "bytes",
        id: 1
      },
      fileSize: {
        type: "int64",
        id: 2
      },
      fileId: {
        type: "bytes",
        id: 3
      },
      batchId: {
        type: "bytes",
        id: 4
      },
      fileKey: {
        type: "bytes",
        id: 5
      },
      mark: {
        type: "bytes",
        id: 6
      },
      sequence: {
        type: "int64",
        id: 7
      },
      batchItemId: {
        type: "bytes",
        id: 8
      },
      feedMsgTime: {
        type: "int32",
        id: 9
      },
      pbReserve: {
        type: "bytes",
        id: 10
      }
    }
  },
  AnonymousGroupMessage: {
    fields: {
      flags: {
        type: "int32",
        id: 1
      },
      anonId: {
        type: "bytes",
        id: 2
      },
      anonNick: {
        type: "bytes",
        id: 3
      },
      headPortrait: {
        type: "int32",
        id: 4
      },
      expireTime: {
        type: "int32",
        id: 5
      },
      bubbleId: {
        type: "int32",
        id: 6
      },
      rankColor: {
        type: "bytes",
        id: 7
      }
    }
  },
  VideoFile: {
    fields: {
      fileUuid: {
        type: "bytes",
        id: 1
      },
      fileMd5: {
        type: "bytes",
        id: 2
      },
      fileName: {
        type: "bytes",
        id: 3
      },
      fileFormat: {
        type: "int32",
        id: 4
      },
      fileTime: {
        type: "int32",
        id: 5
      },
      fileSize: {
        type: "int32",
        id: 6
      },
      thumbWidth: {
        type: "int32",
        id: 7
      },
      thumbHeight: {
        type: "int32",
        id: 8
      },
      thumbFileMd5: {
        type: "bytes",
        id: 9
      },
      source: {
        type: "bytes",
        id: 10
      },
      thumbFileSize: {
        type: "int32",
        id: 11
      },
      busiType: {
        type: "int32",
        id: 12
      },
      fromChatType: {
        type: "int32",
        id: 13
      },
      toChatType: {
        type: "int32",
        id: 14
      },
      boolSupportProgressive: {
        type: "bool",
        id: 15
      },
      fileWidth: {
        type: "int32",
        id: 16
      },
      fileHeight: {
        type: "int32",
        id: 17
      },
      subBusiType: {
        type: "int32",
        id: 18
      },
      videoAttr: {
        type: "int32",
        id: 19
      },
      bytesThumbFileUrls: {
        rule: "repeated",
        type: "bytes",
        id: 20
      },
      bytesVideoFileUrls: {
        rule: "repeated",
        type: "bytes",
        id: 21
      },
      thumbDownloadFlag: {
        type: "int32",
        id: 22
      },
      videoDownloadFlag: {
        type: "int32",
        id: 23
      },
      pbReserve: {
        type: "bytes",
        id: 24
      }
    }
  },
  SourceMsg: {
    fields: {
      origSeqs: {
        rule: "repeated",
        type: "int32",
        id: 1
      },
      senderUin: {
        type: "int64",
        id: 2
      },
      time: {
        type: "int32",
        id: 3
      },
      flag: {
        type: "int32",
        id: 4
      },
      elems: {
        rule: "repeated",
        type: "Elem",
        id: 5
      },
      type: {
        type: "int32",
        id: 6
      },
      richMsg: {
        type: "bytes",
        id: 7
      },
      pbReserve: {
        type: "bytes",
        id: 8
      },
      srcMsg: {
        type: "bytes",
        id: 9
      },
      toUin: {
        type: "int64",
        id: 10
      },
      troopName: {
        type: "bytes",
        id: 11
      }
    }
  },
  Face: {
    fields: {
      index: {
        type: "int32",
        id: 1
      },
      old: {
        type: "bytes",
        id: 2
      },
      buf: {
        type: "bytes",
        id: 11
      }
    }
  },
  LightAppElem: {
    fields: {
      data: {
        type: "bytes",
        id: 1
      },
      msgResid: {
        type: "bytes",
        id: 2
      }
    }
  },
  CustomFace: {
    fields: {
      guid: {
        type: "bytes",
        id: 1
      },
      filePath: {
        type: "string",
        id: 2
      },
      shortcut: {
        type: "string",
        id: 3
      },
      buffer: {
        type: "bytes",
        id: 4
      },
      flag: {
        type: "bytes",
        id: 5
      },
      oldData: {
        type: "bytes",
        id: 6
      },
      fileId: {
        type: "int32",
        id: 7
      },
      serverIp: {
        type: "int32",
        id: 8
      },
      serverPort: {
        type: "int32",
        id: 9
      },
      fileType: {
        type: "int32",
        id: 10
      },
      signature: {
        type: "bytes",
        id: 11
      },
      useful: {
        type: "int32",
        id: 12
      },
      md5: {
        type: "bytes",
        id: 13
      },
      thumbUrl: {
        type: "string",
        id: 14
      },
      bigUrl: {
        type: "string",
        id: 15
      },
      origUrl: {
        type: "string",
        id: 16
      },
      bizType: {
        type: "int32",
        id: 17
      },
      repeatIndex: {
        type: "int32",
        id: 18
      },
      repeatImage: {
        type: "int32",
        id: 19
      },
      imageType: {
        type: "int32",
        id: 20
      },
      index: {
        type: "int32",
        id: 21
      },
      width: {
        type: "int32",
        id: 22
      },
      height: {
        type: "int32",
        id: 23
      },
      source: {
        type: "int32",
        id: 24
      },
      size: {
        type: "int32",
        id: 25
      },
      origin: {
        type: "int32",
        id: 26
      },
      thumbWidth: {
        type: "int32",
        id: 27
      },
      thumbHeight: {
        type: "int32",
        id: 28
      },
      showLen: {
        type: "int32",
        id: 29
      },
      downloadLen: {
        type: "int32",
        id: 30
      },
      _400Url: {
        type: "string",
        id: 31
      },
      _400Width: {
        type: "int32",
        id: 32
      },
      _400Height: {
        type: "int32",
        id: 33
      },
      pbReserve: {
        type: "bytes",
        id: 34
      }
    }
  },
  ContentHead: {
    fields: {
      pkgNum: {
        type: "int32",
        id: 1
      },
      pkgIndex: {
        type: "int32",
        id: 2
      },
      divSeq: {
        type: "int32",
        id: 3
      },
      autoReply: {
        type: "int32",
        id: 4
      }
    }
  },
  MessageHead: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      msgType: {
        type: "int32",
        id: 3
      },
      c2cCmd: {
        type: "int32",
        id: 4
      },
      msgSeq: {
        type: "int32",
        id: 5
      },
      msgTime: {
        type: "int32",
        id: 6
      },
      msgUid: {
        type: "int64",
        id: 7
      },
      c2cTmpMsgHead: {
        type: "C2CTempMessageHead",
        id: 8
      },
      groupInfo: {
        type: "GroupInfo",
        id: 9
      },
      fromAppid: {
        type: "int32",
        id: 10
      },
      fromInstid: {
        type: "int32",
        id: 11
      },
      userActive: {
        type: "int32",
        id: 12
      },
      discussInfo: {
        type: "DiscussInfo",
        id: 13
      },
      fromNick: {
        type: "string",
        id: 14
      },
      authUin: {
        type: "int64",
        id: 15
      },
      authNick: {
        type: "string",
        id: 16
      },
      msgFlag: {
        type: "int32",
        id: 17
      },
      authRemark: {
        type: "string",
        id: 18
      },
      groupName: {
        type: "string",
        id: 19
      },
      mutiltransHead: {
        type: "MutilTransHead",
        id: 20
      },
      msgInstCtrl: {
        type: "InstCtrl",
        id: 21
      },
      publicAccountGroupSendFlag: {
        type: "int32",
        id: 22
      },
      wseqInC2cMsghead: {
        type: "int32",
        id: 23
      },
      cpid: {
        type: "int64",
        id: 24
      },
      extGroupKeyInfo: {
        type: "ExtGroupKeyInfo",
        id: 25
      },
      multiCompatibleText: {
        type: "string",
        id: 26
      },
      authSex: {
        type: "int32",
        id: 27
      },
      isSrcMsg: {
        type: "bool",
        id: 28
      }
    }
  },
  GroupInfo: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      groupType: {
        type: "int32",
        id: 2
      },
      groupInfoSeq: {
        type: "int64",
        id: 3
      },
      groupCard: {
        type: "string",
        id: 4
      },
      groupRank: {
        type: "bytes",
        id: 5
      },
      groupLevel: {
        type: "int32",
        id: 6
      },
      groupCardType: {
        type: "int32",
        id: 7
      },
      groupName: {
        type: "bytes",
        id: 8
      }
    }
  },
  DiscussInfo: {
    fields: {
      discussUin: {
        type: "int64",
        id: 1
      },
      discussType: {
        type: "int32",
        id: 2
      },
      discussInfoSeq: {
        type: "int64",
        id: 3
      },
      discussRemark: {
        type: "bytes",
        id: 4
      },
      discussName: {
        type: "bytes",
        id: 5
      }
    }
  },
  MutilTransHead: {
    fields: {
      status: {
        type: "int32",
        id: 1
      },
      msgId: {
        type: "int32",
        id: 2
      }
    }
  },
  C2CTempMessageHead: {
    fields: {
      c2cType: {
        type: "int32",
        id: 1
      },
      serviceType: {
        type: "int32",
        id: 2
      },
      groupUin: {
        type: "int64",
        id: 3
      },
      groupCode: {
        type: "int64",
        id: 4
      },
      sig: {
        type: "bytes",
        id: 5
      },
      sigType: {
        type: "int32",
        id: 6
      },
      fromPhone: {
        type: "string",
        id: 7
      },
      toPhone: {
        type: "string",
        id: 8
      },
      lockDisplay: {
        type: "int32",
        id: 9
      },
      directionFlag: {
        type: "int32",
        id: 10
      },
      reserved: {
        type: "bytes",
        id: 11
      }
    }
  },
  InstCtrl: {
    fields: {
      msgSendToInst: {
        rule: "repeated",
        type: "InstInfo",
        id: 1
      },
      msgExcludeInst: {
        rule: "repeated",
        type: "InstInfo",
        id: 2
      },
      msgFromInst: {
        type: "InstInfo",
        id: 3
      }
    }
  },
  InstInfo: {
    fields: {
      apppid: {
        type: "int32",
        id: 1
      },
      instid: {
        type: "int32",
        id: 2
      },
      platform: {
        type: "int32",
        id: 3
      },
      enumDeviceType: {
        type: "int32",
        id: 10
      }
    }
  },
  ExtGroupKeyInfo: {
    fields: {
      curMaxSeq: {
        type: "int32",
        id: 1
      },
      curTime: {
        type: "int64",
        id: 2
      }
    }
  },
  SyncCookie: {
    fields: {
      time1: {
        type: "int64",
        id: 1
      },
      time: {
        type: "int64",
        id: 2
      },
      ran1: {
        type: "int64",
        id: 3
      },
      ran2: {
        type: "int64",
        id: 4
      },
      const1: {
        type: "int64",
        id: 5
      },
      const2: {
        type: "int64",
        id: 11
      },
      const3: {
        type: "int64",
        id: 12
      },
      lastSyncTime: {
        type: "int64",
        id: 13
      },
      const4: {
        type: "int64",
        id: 14
      }
    }
  },
  TransMsgInfo: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      msgType: {
        type: "int32",
        id: 3
      },
      msgSubtype: {
        type: "int32",
        id: 4
      },
      msgSeq: {
        type: "int32",
        id: 5
      },
      msgUid: {
        type: "int64",
        id: 6
      },
      msgTime: {
        type: "int32",
        id: 7
      },
      realMsgTime: {
        type: "int32",
        id: 8
      },
      nickName: {
        type: "string",
        id: 9
      },
      msgData: {
        type: "bytes",
        id: 10
      },
      svrIp: {
        type: "int32",
        id: 11
      },
      extGroupKeyInfo: {
        type: "ExtGroupKeyInfo",
        id: 12
      },
      generalFlag: {
        type: "int32",
        id: 17
      }
    }
  },
  GeneralFlags: {
    fields: {
      bubbleDiyTextId: {
        type: "int32",
        id: 1
      },
      groupFlagNew: {
        type: "int32",
        id: 2
      },
      uin: {
        type: "int64",
        id: 3
      },
      rpId: {
        type: "bytes",
        id: 4
      },
      prpFold: {
        type: "int32",
        id: 5
      },
      longTextFlag: {
        type: "int32",
        id: 6
      },
      longTextResid: {
        type: "string",
        id: 7
      },
      groupType: {
        type: "int32",
        id: 8
      },
      toUinFlag: {
        type: "int32",
        id: 9
      },
      glamourLevel: {
        type: "int32",
        id: 10
      },
      memberLevel: {
        type: "int32",
        id: 11
      },
      groupRankSeq: {
        type: "int64",
        id: 12
      },
      olympicTorch: {
        type: "int32",
        id: 13
      },
      babyqGuideMsgCookie: {
        type: "bytes",
        id: 14
      },
      uin32ExpertFlag: {
        type: "int32",
        id: 15
      },
      bubbleSubId: {
        type: "int32",
        id: 16
      },
      pendantId: {
        type: "int64",
        id: 17
      },
      rpIndex: {
        type: "bytes",
        id: 18
      },
      pbReserve: {
        type: "bytes",
        id: 19
      }
    }
  },
  PbMultiMsgItem: {
    fields: {
      fileName: {
        type: "string",
        id: 1
      },
      buffer: {
        type: "bytes",
        id: 2
      }
    }
  },
  PbMultiMsgNew: {
    fields: {
      msg: {
        rule: "repeated",
        type: "Message",
        id: 1
      }
    }
  },
  PbMultiMsgTransmit: {
    fields: {
      msg: {
        rule: "repeated",
        type: "Message",
        id: 1
      },
      pbItemList: {
        rule: "repeated",
        type: "PbMultiMsgItem",
        id: 2
      }
    }
  },
  SyncFlag: {
    values: {
      START: 0,
      CONTINUME: 1,
      STOP: 2
    }
  },
  ExternMsg: {
    fields: {
      channelType: {
        type: "int32",
        id: 1
      }
    }
  },
  MultiMsgApplyDownReq: {
    fields: {
      msgResid: {
        type: "bytes",
        id: 1
      },
      msgType: {
        type: "int32",
        id: 2
      },
      srcUin: {
        type: "int64",
        id: 3
      }
    }
  },
  MultiMsgApplyDownRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      thumbDownPara: {
        type: "bytes",
        id: 2
      },
      msgKey: {
        type: "bytes",
        id: 3
      },
      uint32DownIp: {
        rule: "repeated",
        type: "int32",
        id: 4
      },
      uint32DownPort: {
        rule: "repeated",
        type: "int32",
        id: 5
      },
      msgResid: {
        type: "bytes",
        id: 6
      },
      msgExternInfo: {
        type: "ExternMsg",
        id: 7
      },
      bytesDownIpV6: {
        rule: "repeated",
        type: "bytes",
        id: 8
      },
      uint32DownV6Port: {
        rule: "repeated",
        type: "int32",
        id: 9
      }
    }
  },
  MultiMsgApplyUpReq: {
    fields: {
      dstUin: {
        type: "int64",
        id: 1
      },
      msgSize: {
        type: "int64",
        id: 2
      },
      msgMd5: {
        type: "bytes",
        id: 3
      },
      msgType: {
        type: "int32",
        id: 4
      },
      applyId: {
        type: "int32",
        id: 5
      }
    }
  },
  MultiMsgApplyUpRsp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      msgResid: {
        type: "string",
        id: 2
      },
      msgUkey: {
        type: "bytes",
        id: 3
      },
      uint32UpIp: {
        rule: "repeated",
        type: "int32",
        id: 4
      },
      uint32UpPort: {
        rule: "repeated",
        type: "int32",
        id: 5
      },
      blockSize: {
        type: "int64",
        id: 6
      },
      upOffset: {
        type: "int64",
        id: 7
      },
      applyId: {
        type: "int32",
        id: 8
      },
      msgKey: {
        type: "bytes",
        id: 9
      },
      msgSig: {
        type: "bytes",
        id: 10
      },
      msgExternInfo: {
        type: "ExternMsg",
        id: 11
      },
      bytesUpIpV6: {
        rule: "repeated",
        type: "bytes",
        id: 12
      },
      uint32UpV6Port: {
        rule: "repeated",
        type: "int32",
        id: 13
      }
    }
  },
  MultiReqBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      termType: {
        type: "int32",
        id: 2
      },
      platformType: {
        type: "int32",
        id: 3
      },
      netType: {
        type: "int32",
        id: 4
      },
      buildVer: {
        type: "string",
        id: 5
      },
      multimsgApplyupReq: {
        rule: "repeated",
        type: "MultiMsgApplyUpReq",
        id: 6
      },
      multimsgApplydownReq: {
        rule: "repeated",
        type: "MultiMsgApplyDownReq",
        id: 7
      },
      buType: {
        type: "int32",
        id: 8
      },
      reqChannelType: {
        type: "int32",
        id: 9
      }
    }
  },
  MultiRspBody: {
    fields: {
      subcmd: {
        type: "int32",
        id: 1
      },
      multimsgApplyupRsp: {
        rule: "repeated",
        type: "MultiMsgApplyUpRsp",
        id: 2
      },
      multimsgApplydownRsp: {
        rule: "repeated",
        type: "MultiMsgApplyDownRsp",
        id: 3
      }
    }
  },
  MsgPic: {
    fields: {
      smallPicUrl: {
        type: "bytes",
        id: 1
      },
      originalPicUrl: {
        type: "bytes",
        id: 2
      },
      localPicId: {
        type: "int32",
        id: 3
      }
    }
  },
  ObjMsg: {
    fields: {
      msgType: {
        type: "int32",
        id: 1
      },
      title: {
        type: "bytes",
        id: 2
      },
      bytesAbstact: {
        type: "bytes",
        id: 3
      },
      titleExt: {
        type: "bytes",
        id: 5
      },
      msgPic: {
        rule: "repeated",
        type: "MsgPic",
        id: 6
      },
      msgContentInfo: {
        rule: "repeated",
        type: "MsgContentInfo",
        id: 7
      },
      reportIdShow: {
        type: "int32",
        id: 8
      }
    }
  },
  MsgContentInfo: {
    fields: {
      contentInfoId: {
        type: "bytes",
        id: 1
      },
      msgFile: {
        type: "MsgFile",
        id: 2
      }
    }
  },
  MsgFile: {
    fields: {
      busId: {
        type: "int32",
        id: 1
      },
      filePath: {
        type: "bytes",
        id: 2
      },
      fileSize: {
        type: "int64",
        id: 3
      },
      fileName: {
        type: "string",
        id: 4
      },
      int64DeadTime: {
        type: "int64",
        id: 5
      },
      fileSha1: {
        type: "bytes",
        id: 6
      },
      ext: {
        type: "bytes",
        id: 7
      }
    }
  },
  OIDBSSOPkg: {
    fields: {
      command: {
        type: "int32",
        id: 1
      },
      serviceType: {
        type: "int32",
        id: 2
      },
      result: {
        type: "int32",
        id: 3
      },
      bodybuffer: {
        type: "bytes",
        id: 4
      },
      errorMsg: {
        type: "string",
        id: 5
      },
      clientVersion: {
        type: "string",
        id: 6
      }
    }
  },
  D8A0RspBody: {
    fields: {
      optUint64GroupCode: {
        type: "int64",
        id: 1
      },
      msgKickResult: {
        rule: "repeated",
        type: "D8A0KickResult",
        id: 2
      }
    }
  },
  D8A0KickResult: {
    fields: {
      optUint32Result: {
        type: "int32",
        id: 1
      },
      optUint64MemberUin: {
        type: "int64",
        id: 2
      }
    }
  },
  D8A0KickMemberInfo: {
    fields: {
      optUint32Operate: {
        type: "int32",
        id: 1
      },
      optUint64MemberUin: {
        type: "int64",
        id: 2
      },
      optUint32Flag: {
        type: "int32",
        id: 3
      },
      optBytesMsg: {
        type: "bytes",
        id: 4
      }
    }
  },
  D8A0ReqBody: {
    fields: {
      optUint64GroupCode: {
        type: "int64",
        id: 1
      },
      msgKickList: {
        rule: "repeated",
        type: "D8A0KickMemberInfo",
        id: 2
      },
      kickList: {
        rule: "repeated",
        type: "int64",
        id: 3
      },
      kickFlag: {
        type: "int32",
        id: 4
      },
      kickMsg: {
        type: "bytes",
        id: 5
      }
    }
  },
  D8FCReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      showFlag: {
        type: "int32",
        id: 2
      },
      memLevelInfo: {
        rule: "repeated",
        type: "D8FCMemberInfo",
        id: 3
      },
      levelName: {
        rule: "repeated",
        type: "D8FCLevelName",
        id: 4
      },
      updateTime: {
        type: "int32",
        id: 5
      },
      officeMode: {
        type: "int32",
        id: 6
      },
      groupOpenAppid: {
        type: "int32",
        id: 7
      },
      msgClientInfo: {
        type: "D8FCClientInfo",
        id: 8
      },
      authKey: {
        type: "bytes",
        id: 9
      }
    }
  },
  D89AReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      stGroupInfo: {
        type: "D89AGroupinfo",
        id: 2
      },
      originalOperatorUin: {
        type: "int64",
        id: 3
      },
      reqGroupOpenAppid: {
        type: "int32",
        id: 4
      }
    }
  },
  D89AGroupinfo: {
    oneofs: {
      shutupTime: {
        oneof: [
          "val"
        ]
      }
    },
    fields: {
      groupExtAdmNum: {
        type: "int32",
        id: 1
      },
      flag: {
        type: "int32",
        id: 2
      },
      ingGroupName: {
        type: "bytes",
        id: 3
      },
      ingGroupMemo: {
        type: "bytes",
        id: 4
      },
      ingGroupFingerMemo: {
        type: "bytes",
        id: 5
      },
      ingGroupAioSkinUrl: {
        type: "bytes",
        id: 6
      },
      ingGroupBoardSkinUrl: {
        type: "bytes",
        id: 7
      },
      ingGroupCoverSkinUrl: {
        type: "bytes",
        id: 8
      },
      groupGrade: {
        type: "int32",
        id: 9
      },
      activeMemberNum: {
        type: "int32",
        id: 10
      },
      certificationType: {
        type: "int32",
        id: 11
      },
      ingCertificationText: {
        type: "bytes",
        id: 12
      },
      ingGroupRichFingerMemo: {
        type: "bytes",
        id: 13
      },
      stGroupNewguidelines: {
        type: "D89AGroupNewGuidelinesInfo",
        id: 14
      },
      groupFace: {
        type: "int32",
        id: 15
      },
      addOption: {
        type: "int32",
        id: 16
      },
      val: {
        type: "int32",
        id: 17
      },
      groupTypeFlag: {
        type: "int32",
        id: 18
      },
      stringGroupTag: {
        type: "bytes",
        id: 19
      },
      msgGroupGeoInfo: {
        type: "D89AGroupGeoInfo",
        id: 20
      },
      groupClassExt: {
        type: "int32",
        id: 21
      },
      ingGroupClassText: {
        type: "bytes",
        id: 22
      },
      appPrivilegeFlag: {
        type: "int32",
        id: 23
      },
      appPrivilegeMask: {
        type: "int32",
        id: 24
      },
      stGroupExInfo: {
        type: "D89AGroupExInfoOnly",
        id: 25
      },
      groupSecLevel: {
        type: "int32",
        id: 26
      },
      groupSecLevelInfo: {
        type: "int32",
        id: 27
      },
      subscriptionUin: {
        type: "int64",
        id: 28
      },
      allowMemberInvite: {
        type: "int32",
        id: 29
      },
      ingGroupQuestion: {
        type: "bytes",
        id: 30
      },
      ingGroupAnswer: {
        type: "bytes",
        id: 31
      },
      groupFlagext3: {
        type: "int32",
        id: 32
      },
      groupFlagext3Mask: {
        type: "int32",
        id: 33
      },
      groupOpenAppid: {
        type: "int32",
        id: 34
      },
      noFingerOpenFlag: {
        type: "int32",
        id: 35
      },
      noCodeFingerOpenFlag: {
        type: "int32",
        id: 36
      },
      rootId: {
        type: "int64",
        id: 37
      },
      msgLimitFrequency: {
        type: "int32",
        id: 38
      }
    }
  },
  D89AGroupNewGuidelinesInfo: {
    fields: {
      boolEnabled: {
        type: "bool",
        id: 1
      },
      ingContent: {
        type: "bytes",
        id: 2
      }
    }
  },
  D89AGroupExInfoOnly: {
    fields: {
      tribeId: {
        type: "int32",
        id: 1
      },
      moneyForAddGroup: {
        type: "int32",
        id: 2
      }
    }
  },
  D89AGroupGeoInfo: {
    fields: {
      cityId: {
        type: "int32",
        id: 1
      },
      longtitude: {
        type: "int64",
        id: 2
      },
      latitude: {
        type: "int64",
        id: 3
      },
      ingGeoContent: {
        type: "bytes",
        id: 4
      },
      poiId: {
        type: "int64",
        id: 5
      }
    }
  },
  D8FCMemberInfo: {
    fields: {
      uin: {
        type: "int64",
        id: 1
      },
      point: {
        type: "int32",
        id: 2
      },
      activeDay: {
        type: "int32",
        id: 3
      },
      level: {
        type: "int32",
        id: 4
      },
      specialTitle: {
        type: "bytes",
        id: 5
      },
      specialTitleExpireTime: {
        type: "int32",
        id: 6
      },
      uinName: {
        type: "bytes",
        id: 7
      },
      memberCardName: {
        type: "bytes",
        id: 8
      },
      phone: {
        type: "bytes",
        id: 9
      },
      email: {
        type: "bytes",
        id: 10
      },
      remark: {
        type: "bytes",
        id: 11
      },
      gender: {
        type: "int32",
        id: 12
      },
      job: {
        type: "bytes",
        id: 13
      },
      tribeLevel: {
        type: "int32",
        id: 14
      },
      tribePoint: {
        type: "int32",
        id: 15
      },
      richCardName: {
        rule: "repeated",
        type: "D8FCCardNameElem",
        id: 16
      },
      commRichCardName: {
        type: "bytes",
        id: 17
      }
    }
  },
  D8FCCardNameElem: {
    fields: {
      enumCardType: {
        type: "int32",
        id: 1
      },
      value: {
        type: "bytes",
        id: 2
      }
    }
  },
  D8FCLevelName: {
    fields: {
      level: {
        type: "int32",
        id: 1
      },
      name: {
        type: "string",
        id: 2
      }
    }
  },
  D8FCClientInfo: {
    fields: {
      implat: {
        type: "int32",
        id: 1
      },
      ingClientver: {
        type: "string",
        id: 2
      }
    }
  },
  DeleteFileReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      parentFolderId: {
        type: "string",
        id: 4
      },
      fileId: {
        type: "string",
        id: 5
      }
    }
  },
  DeleteFileRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      }
    }
  },
  DownloadFileReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      fileId: {
        type: "string",
        id: 4
      },
      boolThumbnailReq: {
        type: "bool",
        id: 5
      },
      urlType: {
        type: "int32",
        id: 6
      },
      boolPreviewReq: {
        type: "bool",
        id: 7
      }
    }
  },
  DownloadFileRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      },
      downloadIp: {
        type: "string",
        id: 4
      },
      downloadDns: {
        type: "bytes",
        id: 5
      },
      downloadUrl: {
        type: "bytes",
        id: 6
      },
      sha: {
        type: "bytes",
        id: 7
      },
      sha3: {
        type: "bytes",
        id: 8
      },
      md5: {
        type: "bytes",
        id: 9
      },
      cookieVal: {
        type: "bytes",
        id: 10
      },
      saveFileName: {
        type: "string",
        id: 11
      },
      previewPort: {
        type: "int32",
        id: 12
      }
    }
  },
  MoveFileReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      fileId: {
        type: "string",
        id: 4
      },
      parentFolderId: {
        type: "string",
        id: 5
      },
      destFolderId: {
        type: "string",
        id: 6
      }
    }
  },
  MoveFileRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      },
      parentFolderId: {
        type: "string",
        id: 4
      }
    }
  },
  RenameFileReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      fileId: {
        type: "string",
        id: 4
      },
      parentFolderId: {
        type: "string",
        id: 5
      },
      newFileName: {
        type: "string",
        id: 6
      }
    }
  },
  RenameFileRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      }
    }
  },
  D6D6ReqBody: {
    fields: {
      uploadFileReq: {
        type: "UploadFileReqBody",
        id: 1
      },
      resendFileReq: {
        type: "ResendReqBody",
        id: 2
      },
      downloadFileReq: {
        type: "DownloadFileReqBody",
        id: 3
      },
      deleteFileReq: {
        type: "DeleteFileReqBody",
        id: 4
      },
      renameFileReq: {
        type: "RenameFileReqBody",
        id: 5
      },
      moveFileReq: {
        type: "MoveFileReqBody",
        id: 6
      }
    }
  },
  ResendReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      fileId: {
        type: "string",
        id: 4
      },
      sha: {
        type: "bytes",
        id: 5
      }
    }
  },
  ResendRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      },
      uploadIp: {
        type: "string",
        id: 4
      },
      fileKey: {
        type: "bytes",
        id: 5
      },
      checkKey: {
        type: "bytes",
        id: 6
      }
    }
  },
  D6D6RspBody: {
    fields: {
      uploadFileRsp: {
        type: "UploadFileRspBody",
        id: 1
      },
      resendFileRsp: {
        type: "ResendRspBody",
        id: 2
      },
      downloadFileRsp: {
        type: "DownloadFileRspBody",
        id: 3
      },
      deleteFileRsp: {
        type: "DeleteFileRspBody",
        id: 4
      },
      renameFileRsp: {
        type: "RenameFileRspBody",
        id: 5
      },
      moveFileRsp: {
        type: "MoveFileRspBody",
        id: 6
      }
    }
  },
  UploadFileReqBody: {
    fields: {
      groupCode: {
        type: "int64",
        id: 1
      },
      appId: {
        type: "int32",
        id: 2
      },
      busId: {
        type: "int32",
        id: 3
      },
      entrance: {
        type: "int32",
        id: 4
      },
      parentFolderId: {
        type: "string",
        id: 5
      },
      fileName: {
        type: "string",
        id: 6
      },
      localPath: {
        type: "string",
        id: 7
      },
      int64FileSize: {
        type: "int64",
        id: 8
      },
      sha: {
        type: "bytes",
        id: 9
      },
      sha3: {
        type: "bytes",
        id: 10
      },
      md5: {
        type: "bytes",
        id: 11
      }
    }
  },
  UploadFileRspBody: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      clientWording: {
        type: "string",
        id: 3
      },
      uploadIp: {
        type: "string",
        id: 4
      },
      serverDns: {
        type: "string",
        id: 5
      },
      busId: {
        type: "int32",
        id: 6
      },
      fileId: {
        type: "string",
        id: 7
      },
      fileKey: {
        type: "bytes",
        id: 8
      },
      checkKey: {
        type: "bytes",
        id: 9
      },
      boolFileExist: {
        type: "bool",
        id: 10
      }
    }
  },
  ShortVideoReqBody: {
    fields: {
      cmd: {
        type: "int32",
        id: 1
      },
      seq: {
        type: "int32",
        id: 2
      },
      pttShortVideoDownloadReq: {
        type: "ShortVideoDownloadReq",
        id: 4
      }
    }
  },
  ShortVideoRspBody: {
    fields: {
      cmd: {
        type: "int32",
        id: 1
      },
      seq: {
        type: "int32",
        id: 2
      },
      pttShortVideoDownloadRsp: {
        type: "ShortVideoDownloadRsp",
        id: 4
      }
    }
  },
  ShortVideoDownloadReq: {
    fields: {
      fromUin: {
        type: "int64",
        id: 1
      },
      toUin: {
        type: "int64",
        id: 2
      },
      chatType: {
        type: "int32",
        id: 3
      },
      clientType: {
        type: "int32",
        id: 4
      },
      fileId: {
        type: "string",
        id: 5
      },
      groupCode: {
        type: "int64",
        id: 6
      },
      agentType: {
        type: "int32",
        id: 7
      },
      fileMd5: {
        type: "bytes",
        id: 8
      },
      businessType: {
        type: "int32",
        id: 9
      },
      fileType: {
        type: "int32",
        id: 10
      },
      downType: {
        type: "int32",
        id: 11
      },
      sceneType: {
        type: "int32",
        id: 12
      }
    }
  },
  ShortVideoDownloadRsp: {
    fields: {
      retCode: {
        type: "int32",
        id: 1
      },
      retMsg: {
        type: "string",
        id: 2
      },
      sameAreaOutAddr: {
        rule: "repeated",
        type: "ShortVideoIpList",
        id: 3
      },
      diffAreaOutAddr: {
        rule: "repeated",
        type: "ShortVideoIpList",
        id: 4
      },
      downloadKey: {
        type: "bytes",
        id: 5
      },
      fileMd5: {
        type: "bytes",
        id: 6
      },
      sameAreaInnerAddr: {
        rule: "repeated",
        type: "ShortVideoIpList",
        id: 7
      },
      diffAreaInnerAddr: {
        rule: "repeated",
        type: "ShortVideoIpList",
        id: 8
      },
      downloadAddr: {
        type: "ShortVideoAddr",
        id: 9
      },
      encryptKey: {
        type: "bytes",
        id: 10
      }
    }
  },
  ShortVideoIpList: {
    fields: {
      ip: {
        type: "int32",
        id: 1
      },
      port: {
        type: "int32",
        id: 2
      }
    }
  },
  ShortVideoAddr: {
    fields: {
      host: {
        rule: "repeated",
        type: "string",
        id: 10
      },
      urlArgs: {
        type: "string",
        id: 11
      }
    }
  },
  AddFrdSNInfo: {
    fields: {
      notSeeDynamic: {
        type: "int32",
        id: 1
      },
      setSn: {
        type: "int32",
        id: 2
      }
    }
  },
  FlagInfo: {
    fields: {
      grpMsgKickAdmin: {
        type: "int32",
        id: 1
      },
      grpMsgHiddenGrp: {
        type: "int32",
        id: 2
      },
      grpMsgWordingDown: {
        type: "int32",
        id: 3
      },
      frdMsgGetBusiCard: {
        type: "int32",
        id: 4
      },
      grpMsgGetOfficialAccount: {
        type: "int32",
        id: 5
      },
      grpMsgGetPayInGroup: {
        type: "int32",
        id: 6
      },
      frdMsgDiscuss2ManyChat: {
        type: "int32",
        id: 7
      },
      grpMsgNotAllowJoinGrpInviteNotFrd: {
        type: "int32",
        id: 8
      },
      frdMsgNeedWaitingMsg: {
        type: "int32",
        id: 9
      },
      frdMsgUint32NeedAllUnreadMsg: {
        type: "int32",
        id: 10
      },
      grpMsgNeedAutoAdminWording: {
        type: "int32",
        id: 11
      },
      grpMsgGetTransferGroupMsgFlag: {
        type: "int32",
        id: 12
      },
      grpMsgGetQuitPayGroupMsgFlag: {
        type: "int32",
        id: 13
      },
      grpMsgSupportInviteAutoJoin: {
        type: "int32",
        id: 14
      },
      grpMsgMaskInviteAutoJoin: {
        type: "int32",
        id: 15
      },
      grpMsgGetDisbandedByAdmin: {
        type: "int32",
        id: 16
      },
      grpMsgGetC2cInviteJoinGroup: {
        type: "int32",
        id: 17
      }
    }
  },
  FriendInfo: {
    fields: {
      msgJointFriend: {
        type: "string",
        id: 1
      },
      msgBlacklist: {
        type: "string",
        id: 2
      }
    }
  },
  SGroupInfo: {
    fields: {
      groupAuthType: {
        type: "int32",
        id: 1
      },
      displayAction: {
        type: "int32",
        id: 2
      },
      msgAlert: {
        type: "string",
        id: 3
      },
      msgDetailAlert: {
        type: "string",
        id: 4
      },
      msgOtherAdminDone: {
        type: "string",
        id: 5
      },
      appPrivilegeFlag: {
        type: "int32",
        id: 6
      }
    }
  },
  MsgInviteExt: {
    fields: {
      srcType: {
        type: "int32",
        id: 1
      },
      srcCode: {
        type: "int64",
        id: 2
      },
      waitState: {
        type: "int32",
        id: 3
      }
    }
  },
  MsgPayGroupExt: {
    fields: {
      joinGrpTime: {
        type: "int64",
        id: 1
      },
      quitGrpTime: {
        type: "int64",
        id: 2
      }
    }
  },
  ReqNextSystemMsg: {
    fields: {
      msgNum: {
        type: "int32",
        id: 1
      },
      followingFriendSeq: {
        type: "int64",
        id: 2
      },
      followingGroupSeq: {
        type: "int64",
        id: 3
      },
      checktype: {
        type: "int32",
        id: 4
      },
      flag: {
        type: "FlagInfo",
        id: 5
      },
      language: {
        type: "int32",
        id: 6
      },
      version: {
        type: "int32",
        id: 7
      },
      friendMsgTypeFlag: {
        type: "int64",
        id: 8
      }
    }
  },
  ReqSystemMsg: {
    fields: {
      msgNum: {
        type: "int32",
        id: 1
      },
      latestFriendSeq: {
        type: "int64",
        id: 2
      },
      latestGroupSeq: {
        type: "int64",
        id: 3
      },
      version: {
        type: "int32",
        id: 4
      },
      language: {
        type: "int32",
        id: 5
      }
    }
  },
  ReqSystemMsgAction: {
    fields: {
      msgType: {
        type: "int32",
        id: 1
      },
      msgSeq: {
        type: "int64",
        id: 2
      },
      reqUin: {
        type: "int64",
        id: 3
      },
      subType: {
        type: "int32",
        id: 4
      },
      srcId: {
        type: "int32",
        id: 5
      },
      subSrcId: {
        type: "int32",
        id: 6
      },
      groupMsgType: {
        type: "int32",
        id: 7
      },
      actionInfo: {
        type: "SystemMsgActionInfo",
        id: 8
      },
      language: {
        type: "int32",
        id: 9
      }
    }
  },
  ReqSystemMsgNew: {
    fields: {
      msgNum: {
        type: "int32",
        id: 1
      },
      latestFriendSeq: {
        type: "int64",
        id: 2
      },
      latestGroupSeq: {
        type: "int64",
        id: 3
      },
      version: {
        type: "int32",
        id: 4
      },
      checktype: {
        type: "int32",
        id: 5
      },
      flag: {
        type: "FlagInfo",
        id: 6
      },
      language: {
        type: "int32",
        id: 7
      },
      isGetFrdRibbon: {
        type: "bool",
        id: 8
      },
      isGetGrpRibbon: {
        type: "bool",
        id: 9
      },
      friendMsgTypeFlag: {
        type: "int64",
        id: 10
      }
    }
  },
  ReqSystemMsgRead: {
    fields: {
      latestFriendSeq: {
        type: "int64",
        id: 1
      },
      latestGroupSeq: {
        type: "int64",
        id: 2
      },
      type: {
        type: "int32",
        id: 3
      },
      checktype: {
        type: "int32",
        id: 4
      }
    }
  },
  RspHead: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      msgFail: {
        type: "string",
        id: 2
      }
    }
  },
  RspNextSystemMsg: {
    fields: {
      head: {
        type: "RspHead",
        id: 1
      },
      msgs: {
        rule: "repeated",
        type: "StructMsg",
        id: 2
      },
      followingFriendSeq: {
        type: "int64",
        id: 3
      },
      followingGroupSeq: {
        type: "int64",
        id: 4
      },
      checktype: {
        type: "int32",
        id: 5
      },
      gameNick: {
        type: "string",
        id: 100
      },
      undecidForQim: {
        type: "bytes",
        id: 101
      },
      unReadCount3: {
        type: "int32",
        id: 102
      }
    }
  },
  RspSystemMsg: {
    fields: {
      head: {
        type: "RspHead",
        id: 1
      },
      msgs: {
        rule: "repeated",
        type: "StructMsg",
        id: 2
      },
      unreadCount: {
        type: "int32",
        id: 3
      },
      latestFriendSeq: {
        type: "int64",
        id: 4
      },
      latestGroupSeq: {
        type: "int64",
        id: 5
      },
      followingFriendSeq: {
        type: "int64",
        id: 6
      },
      followingGroupSeq: {
        type: "int64",
        id: 7
      },
      msgDisplay: {
        type: "string",
        id: 8
      }
    }
  },
  RspSystemMsgAction: {
    fields: {
      head: {
        type: "RspHead",
        id: 1
      },
      msgDetail: {
        type: "string",
        id: 2
      },
      type: {
        type: "int32",
        id: 3
      },
      msgInvalidDecided: {
        type: "string",
        id: 5
      },
      remarkResult: {
        type: "int32",
        id: 6
      }
    }
  },
  RspSystemMsgNew: {
    fields: {
      head: {
        type: "RspHead",
        id: 1
      },
      unreadFriendCount: {
        type: "int32",
        id: 2
      },
      unreadGroupCount: {
        type: "int32",
        id: 3
      },
      latestFriendSeq: {
        type: "int64",
        id: 4
      },
      latestGroupSeq: {
        type: "int64",
        id: 5
      },
      followingFriendSeq: {
        type: "int64",
        id: 6
      },
      followingGroupSeq: {
        type: "int64",
        id: 7
      },
      friendmsgs: {
        rule: "repeated",
        type: "StructMsg",
        id: 9
      },
      groupmsgs: {
        rule: "repeated",
        type: "StructMsg",
        id: 10
      },
      msgRibbonFriend: {
        type: "StructMsg",
        id: 11
      },
      msgRibbonGroup: {
        type: "StructMsg",
        id: 12
      },
      msgDisplay: {
        type: "string",
        id: 13
      },
      grpMsgDisplay: {
        type: "string",
        id: 14
      },
      over: {
        type: "int32",
        id: 15
      },
      checktype: {
        type: "int32",
        id: 20
      },
      gameNick: {
        type: "string",
        id: 100
      },
      undecidForQim: {
        type: "bytes",
        id: 101
      },
      unReadCount3: {
        type: "int32",
        id: 102
      }
    }
  },
  RspSystemMsgRead: {
    fields: {
      head: {
        type: "RspHead",
        id: 1
      },
      type: {
        type: "int32",
        id: 2
      },
      checktype: {
        type: "int32",
        id: 3
      }
    }
  },
  StructMsg: {
    fields: {
      version: {
        type: "int32",
        id: 1
      },
      msgType: {
        type: "int32",
        id: 2
      },
      msgSeq: {
        type: "int64",
        id: 3
      },
      msgTime: {
        type: "int64",
        id: 4
      },
      reqUin: {
        type: "int64",
        id: 5
      },
      unreadFlag: {
        type: "int32",
        id: 6
      },
      msg: {
        type: "SystemMsg",
        id: 50
      }
    }
  },
  SystemMsg: {
    fields: {
      subType: {
        type: "int32",
        id: 1
      },
      msgTitle: {
        type: "string",
        id: 2
      },
      msgDescribe: {
        type: "string",
        id: 3
      },
      msgAdditional: {
        type: "string",
        id: 4
      },
      msgSource: {
        type: "string",
        id: 5
      },
      msgDecided: {
        type: "string",
        id: 6
      },
      srcId: {
        type: "int32",
        id: 7
      },
      subSrcId: {
        type: "int32",
        id: 8
      },
      actions: {
        rule: "repeated",
        type: "SystemMsgAction",
        id: 9
      },
      groupCode: {
        type: "int64",
        id: 10
      },
      actionUin: {
        type: "int64",
        id: 11
      },
      groupMsgType: {
        type: "int32",
        id: 12
      },
      groupInviterRole: {
        type: "int32",
        id: 13
      },
      friendInfo: {
        type: "FriendInfo",
        id: 14
      },
      groupInfo: {
        type: "SGroupInfo",
        id: 15
      },
      actorUin: {
        type: "int64",
        id: 16
      },
      msgActorDescribe: {
        type: "string",
        id: 17
      },
      msgAdditionalList: {
        type: "string",
        id: 18
      },
      relation: {
        type: "int32",
        id: 19
      },
      reqsubtype: {
        type: "int32",
        id: 20
      },
      cloneUin: {
        type: "int64",
        id: 21
      },
      discussUin: {
        type: "int64",
        id: 22
      },
      eimGroupId: {
        type: "int64",
        id: 23
      },
      msgInviteExtinfo: {
        type: "MsgInviteExt",
        id: 24
      },
      msgPayGroupExtinfo: {
        type: "MsgPayGroupExt",
        id: 25
      },
      sourceFlag: {
        type: "int32",
        id: 26
      },
      gameNick: {
        type: "bytes",
        id: 27
      },
      gameMsg: {
        type: "bytes",
        id: 28
      },
      groupFlagext3: {
        type: "int32",
        id: 29
      },
      groupOwnerUin: {
        type: "int64",
        id: 30
      },
      doubtFlag: {
        type: "int32",
        id: 31
      },
      warningTips: {
        type: "bytes",
        id: 32
      },
      nameMore: {
        type: "bytes",
        id: 33
      },
      reqUinFaceid: {
        type: "int32",
        id: 50
      },
      reqUinNick: {
        type: "string",
        id: 51
      },
      groupName: {
        type: "string",
        id: 52
      },
      actionUinNick: {
        type: "string",
        id: 53
      },
      msgQna: {
        type: "string",
        id: 54
      },
      msgDetail: {
        type: "string",
        id: 55
      },
      groupExtFlag: {
        type: "int32",
        id: 57
      },
      actorUinNick: {
        type: "string",
        id: 58
      },
      picUrl: {
        type: "string",
        id: 59
      },
      cloneUinNick: {
        type: "string",
        id: 60
      },
      reqUinBusinessCard: {
        type: "string",
        id: 61
      },
      eimGroupIdName: {
        type: "string",
        id: 63
      },
      reqUinPreRemark: {
        type: "string",
        id: 64
      },
      actionUinQqNick: {
        type: "string",
        id: 65
      },
      actionUinRemark: {
        type: "string",
        id: 66
      },
      reqUinGender: {
        type: "int32",
        id: 67
      },
      reqUinAge: {
        type: "int32",
        id: 68
      },
      c2cInviteJoinGroupFlag: {
        type: "int32",
        id: 69
      },
      cardSwitch: {
        type: "int32",
        id: 101
      }
    }
  },
  SystemMsgAction: {
    fields: {
      name: {
        type: "string",
        id: 1
      },
      result: {
        type: "string",
        id: 2
      },
      action: {
        type: "int32",
        id: 3
      },
      actionInfo: {
        type: "SystemMsgActionInfo",
        id: 4
      },
      detailName: {
        type: "string",
        id: 5
      }
    }
  },
  SystemMsgActionInfo: {
    fields: {
      type: {
        type: "int32",
        id: 1
      },
      groupCode: {
        type: "int64",
        id: 2
      },
      sig: {
        type: "bytes",
        id: 3
      },
      msg: {
        type: "string",
        id: 50
      },
      groupId: {
        type: "int32",
        id: 51
      },
      remark: {
        type: "string",
        id: 52
      },
      blacklist: {
        type: "bool",
        id: 53
      },
      addFrdSNInfo: {
        type: "AddFrdSNInfo",
        id: 54
      }
    }
  },
  PbSendMsgResp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      errmsg: {
        type: "string",
        id: 2
      },
      sendTime: {
        type: "int32",
        id: 3
      },
      svrbusyWaitTime: {
        type: "int32",
        id: 4
      },
      errtype: {
        type: "int32",
        id: 6
      }
    }
  },
  PbDeleteMsgResp: {
    fields: {
      result: {
        type: "int32",
        id: 1
      },
      errmsg: {
        type: "string",
        id: 2
      }
    }
  }
});

/**
 * @param {String} name 
 * @param {Object} object 
 */
function encode(name, object) {
  const pb = $root.lookupType(name);
  return pb.encode(pb.create(object)).finish();
}

/**
* @param {String} name 
* @param {Buffer} blob 
*/
function decode(name, blob) {
  const pb = $root.lookupType(name);
  return pb.toObject(pb.decode(blob));
}

module.exports = {
  encode, decode
};

// module.exports = $root;
