import { describe, expect, it } from "bun:test";
import {
  DeviceError,
  checkForDeviceError,
  decodeInfoResponse,
  decodeTimingResponse,
  decodeStateResponse,
  decodeTriggerResponse,
  decodeFrameResponse,
  decodeChannelMapResponse,
  decodeSetChannelMapResponse,
  decodeChannelLabelsResponse,
  decodeVarListResponse,
  decodeRtLabelsResponse,
  decodeRtBufferResponse,
  decodeTriggerParamsResponse,
  decodeSnapshotHeaderResponse,
  decodeSnapshotDataResponse,
  encodeGetInfoRequest,
  encodeGetTimingRequest,
  encodeSetTimingRequest,
  encodeGetStateRequest,
  encodeSetStateRequest,
  encodeTriggerRequest,
  encodeGetFrameRequest,
  encodeGetSnapshotHeaderRequest,
  encodeGetSnapshotDataRequest,
  encodeGetVarListRequest,
  encodeGetChannelMapRequest,
  encodeSetChannelMapRequest,
  encodeGetChannelLabelsRequest,
  encodeGetRtLabelsRequest,
  encodeGetRtBufferRequest,
  encodeSetRtBufferRequest,
  encodeGetTriggerRequest,
  encodeSetTriggerRequest,
} from "./codec";
import { MessageType, State, TriggerMode, ErrorCode } from "./types";
import type { DeviceInfo } from "./device-info";
import { writeU32LE, writeF32LE, writeU16LE } from "./bytes";

// Test fixture: typical device info
const testDeviceInfo: DeviceInfo = {
  protocolVersion: 1,
  numChannels: 5,
  bufferSize: 1000,
  isrKhz: 10,
  varCount: 8,
  rtCount: 4,
  rtBufferLen: 16,
  nameLen: 16,
  deviceName: "TestDevice",
};

describe("checkForDeviceError", () => {
  it("does nothing for non-error type", () => {
    expect(() => checkForDeviceError(MessageType.GET_INFO, new Uint8Array([]))).not.toThrow();
  });

  it("throws DeviceError for error type", () => {
    expect(() =>
      checkForDeviceError(MessageType.ERROR, new Uint8Array([ErrorCode.BAD_PARAM]))
    ).toThrow(DeviceError);
  });

  it("throws with correct error code", () => {
    try {
      checkForDeviceError(MessageType.ERROR, new Uint8Array([ErrorCode.NOT_READY]));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DeviceError);
      expect((e as DeviceError).code).toBe(ErrorCode.NOT_READY);
    }
  });

  it("throws for malformed error response", () => {
    expect(() => checkForDeviceError(MessageType.ERROR, new Uint8Array([]))).toThrow(
      "Malformed error response"
    );
  });
});

describe("decodeInfoResponse", () => {
  it("decodes valid response", () => {
    // Build a valid GET_INFO response payload
    const nameLen = 16;
    const payload = new Uint8Array(10 + nameLen);
    payload[0] = 1; // protocol version
    payload[1] = 5; // channels
    payload[2] = 0xe8; // buffer_size = 1000 (LE)
    payload[3] = 0x03;
    payload[4] = 0x0a; // isr_khz = 10 (LE)
    payload[5] = 0x00;
    payload[6] = 8; // var_count
    payload[7] = 4; // rt_count
    payload[8] = 16; // rt_buffer_len
    payload[9] = 16; // name_len
    // Device name "TestDev"
    const name = new TextEncoder().encode("TestDev");
    payload.set(name, 10);

    const info = decodeInfoResponse(payload);
    expect(info.protocolVersion).toBe(1);
    expect(info.numChannels).toBe(5);
    expect(info.bufferSize).toBe(1000);
    expect(info.isrKhz).toBe(10);
    expect(info.varCount).toBe(8);
    expect(info.rtCount).toBe(4);
    expect(info.rtBufferLen).toBe(16);
    expect(info.nameLen).toBe(16);
    expect(info.deviceName).toBe("TestDev");
  });

  it("throws on too short payload", () => {
    expect(() => decodeInfoResponse(new Uint8Array(5))).toThrow("too short");
  });

  it("throws when device name missing", () => {
    const payload = new Uint8Array(10);
    payload[9] = 16; // name_len = 16, but no name data
    expect(() => decodeInfoResponse(payload)).toThrow("missing device name");
  });
});

describe("decodeTimingResponse", () => {
  it("decodes valid response", () => {
    const payload = new Uint8Array(8);
    writeU32LE(payload, 0, 100); // divider
    writeU32LE(payload, 4, 500); // preTrig
    const result = decodeTimingResponse(payload);
    expect(result.divider).toBe(100);
    expect(result.preTrig).toBe(500);
  });

  it("throws on too short", () => {
    expect(() => decodeTimingResponse(new Uint8Array(4))).toThrow("too short");
  });
});

describe("decodeStateResponse", () => {
  it("decodes HALTED state", () => {
    const result = decodeStateResponse(new Uint8Array([State.HALTED]));
    expect(result.state).toBe(State.HALTED);
  });

  it("decodes RUNNING state", () => {
    const result = decodeStateResponse(new Uint8Array([State.RUNNING]));
    expect(result.state).toBe(State.RUNNING);
  });

  it("decodes ACQUIRING state", () => {
    const result = decodeStateResponse(new Uint8Array([State.ACQUIRING]));
    expect(result.state).toBe(State.ACQUIRING);
  });

  it("throws on empty payload", () => {
    expect(() => decodeStateResponse(new Uint8Array([]))).toThrow("too short");
  });
});

describe("decodeTriggerResponse", () => {
  it("accepts empty payload", () => {
    expect(() => decodeTriggerResponse(new Uint8Array([]))).not.toThrow();
  });

  it("throws on non-empty payload", () => {
    expect(() => decodeTriggerResponse(new Uint8Array([0x00]))).toThrow("should be empty");
  });
});

describe("decodeFrameResponse", () => {
  it("decodes frame with correct channel count", () => {
    const payload = new Uint8Array(testDeviceInfo.numChannels * 4);
    writeF32LE(payload, 0, 1.0);
    writeF32LE(payload, 4, 2.0);
    writeF32LE(payload, 8, 3.0);
    writeF32LE(payload, 12, 4.0);
    writeF32LE(payload, 16, 5.0);

    const result = decodeFrameResponse(payload, testDeviceInfo);
    expect(result.values).toEqual([1.0, 2.0, 3.0, 4.0, 5.0]);
  });

  it("throws on wrong size", () => {
    expect(() => decodeFrameResponse(new Uint8Array(8), testDeviceInfo)).toThrow("wrong size");
  });
});

describe("decodeChannelMapResponse", () => {
  it("decodes channel map", () => {
    const payload = new Uint8Array([0, 1, 2, 3, 4]);
    const result = decodeChannelMapResponse(payload, testDeviceInfo);
    expect(result.varIds).toEqual([0, 1, 2, 3, 4]);
  });

  it("throws on wrong size", () => {
    expect(() => decodeChannelMapResponse(new Uint8Array(3), testDeviceInfo)).toThrow("wrong size");
  });
});

describe("decodeSetChannelMapResponse", () => {
  it("decodes single channel update echo", () => {
    const payload = new Uint8Array([2, 5]); // channelIdx=2, catalogIdx=5
    const result = decodeSetChannelMapResponse(payload);
    expect(result.channelIdx).toBe(2);
    expect(result.catalogIdx).toBe(5);
  });

  it("throws on wrong size", () => {
    expect(() => decodeSetChannelMapResponse(new Uint8Array(3))).toThrow("wrong size");
    expect(() => decodeSetChannelMapResponse(new Uint8Array(1))).toThrow("wrong size");
  });
});

describe("decodeChannelLabelsResponse", () => {
  it("decodes channel labels", () => {
    const payload = new Uint8Array(testDeviceInfo.numChannels * testDeviceInfo.nameLen);
    const labels = ["CH0", "CH1", "CH2", "CH3", "CH4"];
    labels.forEach((label, i) => {
      const encoded = new TextEncoder().encode(label);
      payload.set(encoded, i * testDeviceInfo.nameLen);
    });

    const result = decodeChannelLabelsResponse(payload, testDeviceInfo);
    expect(result.labels).toEqual(labels);
  });

  it("throws on wrong size", () => {
    expect(() => decodeChannelLabelsResponse(new Uint8Array(10), testDeviceInfo)).toThrow(
      "wrong size"
    );
  });
});

describe("decodeVarListResponse", () => {
  it("decodes variable list", () => {
    // Header: totalCount=8, startIdx=0, count=2
    // Entries: [id=0, name], [id=1, name]
    const entrySize = 1 + testDeviceInfo.nameLen;
    const payload = new Uint8Array(3 + 2 * entrySize);
    payload[0] = 8; // totalCount
    payload[1] = 0; // startIdx
    payload[2] = 2; // count

    // Entry 0
    payload[3] = 0;
    const name0 = new TextEncoder().encode("Var0");
    payload.set(name0, 4);

    // Entry 1
    payload[3 + entrySize] = 1;
    const name1 = new TextEncoder().encode("Var1");
    payload.set(name1, 4 + entrySize);

    const result = decodeVarListResponse(payload, testDeviceInfo);
    expect(result.totalCount).toBe(8);
    expect(result.startIdx).toBe(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({ id: 0, name: "Var0" });
    expect(result.entries[1]).toEqual({ id: 1, name: "Var1" });
  });

  it("throws on too short header", () => {
    expect(() => decodeVarListResponse(new Uint8Array(2), testDeviceInfo)).toThrow("too short");
  });
});

describe("decodeRtBufferResponse", () => {
  it("decodes RT buffer value", () => {
    const payload = new Uint8Array(4);
    writeF32LE(payload, 0, 42.5);
    const result = decodeRtBufferResponse(payload);
    expect(result.value).toBe(42.5);
  });

  it("throws on wrong size", () => {
    expect(() => decodeRtBufferResponse(new Uint8Array(3))).toThrow("wrong size");
  });
});

describe("decodeTriggerParamsResponse", () => {
  it("decodes trigger params", () => {
    const payload = new Uint8Array(6);
    writeF32LE(payload, 0, 1.5); // threshold
    payload[4] = 2; // channel
    payload[5] = TriggerMode.RISING; // mode

    const result = decodeTriggerParamsResponse(payload);
    expect(result.threshold).toBe(1.5);
    expect(result.channel).toBe(2);
    expect(result.mode).toBe(TriggerMode.RISING);
  });

  it("throws on wrong size", () => {
    expect(() => decodeTriggerParamsResponse(new Uint8Array(4))).toThrow("wrong size");
  });
});

describe("decodeSnapshotHeaderResponse", () => {
  it("decodes snapshot header", () => {
    // Layout: channelMap[5] + divider(4) + preTrig(4) + threshold(4) + channel(1) + mode(1) + rtValues[4*4]
    const fixedSize = 5 + 4 + 4 + 4 + 1 + 1;
    const rtSize = testDeviceInfo.rtCount * 4;
    const payload = new Uint8Array(fixedSize + rtSize);

    let offset = 0;
    // Channel map
    for (let i = 0; i < 5; i++) {
      payload[offset++] = i;
    }
    // Timing
    writeU32LE(payload, offset, 50);
    offset += 4;
    writeU32LE(payload, offset, 250);
    offset += 4;
    // Trigger
    writeF32LE(payload, offset, 2.5);
    offset += 4;
    payload[offset++] = 1; // channel
    payload[offset++] = TriggerMode.FALLING; // mode
    // RT values
    for (let i = 0; i < testDeviceInfo.rtCount; i++) {
      writeF32LE(payload, offset, i * 1.1);
      offset += 4;
    }

    const result = decodeSnapshotHeaderResponse(payload, testDeviceInfo);
    expect(result.channelMap).toEqual([0, 1, 2, 3, 4]);
    expect(result.divider).toBe(50);
    expect(result.preTrig).toBe(250);
    expect(result.triggerThreshold).toBe(2.5);
    expect(result.triggerChannel).toBe(1);
    expect(result.triggerMode).toBe(TriggerMode.FALLING);
    expect(result.rtValues).toHaveLength(4);
    expect(result.rtValues[0]).toBeCloseTo(0);
    expect(result.rtValues[1]).toBeCloseTo(1.1);
  });

  it("throws on wrong size", () => {
    expect(() => decodeSnapshotHeaderResponse(new Uint8Array(10), testDeviceInfo)).toThrow(
      "wrong size"
    );
  });
});

describe("decodeSnapshotDataResponse", () => {
  it("decodes snapshot data", () => {
    const sampleCount = 3;
    const payload = new Uint8Array(sampleCount * testDeviceInfo.numChannels * 4);
    let offset = 0;
    for (let s = 0; s < sampleCount; s++) {
      for (let c = 0; c < testDeviceInfo.numChannels; c++) {
        writeF32LE(payload, offset, s * 10 + c);
        offset += 4;
      }
    }

    const result = decodeSnapshotDataResponse(payload, testDeviceInfo, sampleCount);
    expect(result.samples).toHaveLength(3);
    expect(result.samples[0]).toEqual([0, 1, 2, 3, 4]);
    expect(result.samples[1]).toEqual([10, 11, 12, 13, 14]);
    expect(result.samples[2]).toEqual([20, 21, 22, 23, 24]);
  });

  it("throws on wrong size", () => {
    expect(() => decodeSnapshotDataResponse(new Uint8Array(10), testDeviceInfo, 3)).toThrow(
      "wrong size"
    );
  });
});

// --- Encode tests ---

describe("encodeGetInfoRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetInfoRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_INFO]));
  });
});

describe("encodeGetTimingRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetTimingRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_TIMING]));
  });
});

describe("encodeSetTimingRequest", () => {
  it("encodes divider and preTrig", () => {
    const result = encodeSetTimingRequest(100, 500);
    expect(result[0]).toBe(MessageType.SET_TIMING);
    expect(result.length).toBe(9);

    // Verify values can be decoded back
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getUint32(1, true)).toBe(100);
    expect(view.getUint32(5, true)).toBe(500);
  });
});

describe("encodeGetStateRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetStateRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_STATE]));
  });
});

describe("encodeSetStateRequest", () => {
  it("encodes state", () => {
    const result = encodeSetStateRequest(State.RUNNING);
    expect(result).toEqual(new Uint8Array([MessageType.SET_STATE, State.RUNNING]));
  });
});

describe("encodeTriggerRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeTriggerRequest();
    expect(result).toEqual(new Uint8Array([MessageType.TRIGGER]));
  });
});

describe("encodeGetFrameRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetFrameRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_FRAME]));
  });
});

describe("encodeGetSnapshotHeaderRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetSnapshotHeaderRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_SNAPSHOT_HEADER]));
  });
});

describe("encodeGetSnapshotDataRequest", () => {
  it("encodes start sample and count", () => {
    const result = encodeGetSnapshotDataRequest(100, 10);
    expect(result[0]).toBe(MessageType.GET_SNAPSHOT_DATA);
    expect(result.length).toBe(4);

    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getUint16(1, true)).toBe(100);
    expect(result[3]).toBe(10);
  });
});

describe("encodeGetVarListRequest", () => {
  it("returns TYPE only when no params", () => {
    const result = encodeGetVarListRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_VAR_LIST]));
  });

  it("encodes pagination params", () => {
    const result = encodeGetVarListRequest(5, 10);
    expect(result[0]).toBe(MessageType.GET_VAR_LIST);
    expect(result[1]).toBe(5);
    expect(result[2]).toBe(10);
  });
});

describe("encodeGetChannelMapRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetChannelMapRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_CHANNEL_MAP]));
  });
});

describe("encodeSetChannelMapRequest", () => {
  it("encodes channel and catalog index", () => {
    const result = encodeSetChannelMapRequest(2, 5);
    expect(result[0]).toBe(MessageType.SET_CHANNEL_MAP);
    expect(result[1]).toBe(2); // channelIdx
    expect(result[2]).toBe(5); // catalogIdx
    expect(result.length).toBe(3);
  });
});

describe("encodeGetChannelLabelsRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetChannelLabelsRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_CHANNEL_LABELS]));
  });
});

describe("encodeGetRtLabelsRequest", () => {
  it("returns TYPE only when no params", () => {
    const result = encodeGetRtLabelsRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_RT_LABELS]));
  });

  it("encodes pagination params", () => {
    const result = encodeGetRtLabelsRequest(2, 8);
    expect(result[0]).toBe(MessageType.GET_RT_LABELS);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(8);
  });
});

describe("encodeGetRtBufferRequest", () => {
  it("encodes index", () => {
    const result = encodeGetRtBufferRequest(5);
    expect(result).toEqual(new Uint8Array([MessageType.GET_RT_BUFFER, 5]));
  });
});

describe("encodeSetRtBufferRequest", () => {
  it("encodes index and value", () => {
    const result = encodeSetRtBufferRequest(3, 42.5);
    expect(result[0]).toBe(MessageType.SET_RT_BUFFER);
    expect(result[1]).toBe(3);
    expect(result.length).toBe(6);

    // Verify float can be decoded back
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getFloat32(2, true)).toBe(42.5);
  });
});

describe("encodeGetTriggerRequest", () => {
  it("returns TYPE byte only", () => {
    const result = encodeGetTriggerRequest();
    expect(result).toEqual(new Uint8Array([MessageType.GET_TRIGGER]));
  });
});

describe("encodeSetTriggerRequest", () => {
  it("encodes threshold, channel, and mode", () => {
    const result = encodeSetTriggerRequest(1.5, 2, TriggerMode.BOTH);
    expect(result[0]).toBe(MessageType.SET_TRIGGER);
    expect(result.length).toBe(7);

    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getFloat32(1, true)).toBe(1.5);
    expect(result[5]).toBe(2);
    expect(result[6]).toBe(TriggerMode.BOTH);
  });
});
