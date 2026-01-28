/**
 * Protocol encode/decode functions.
 * Pure functions that throw on invalid data.
 * Effect wrapping happens at the boundary (e.g., device.ts).
 */

import {
  readU8,
  readU16,
  readU32,
  readF32,
  readStringFixed,
  writeU8,
  writeU16,
  writeU32,
  writeF32,
} from "./bytes";
import {
  DeviceInfoSchema,
  TimingResponseSchema,
  StateResponseSchema,
  FrameResponseSchema,
  ChannelMapResponseSchema,
  VarListResponseSchema,
  RtLabelsResponseSchema,
  RtBufferResponseSchema,
  TriggerResponseSchema,
  SnapshotHeaderResponseSchema,
  SnapshotDataResponseSchema,
  type DeviceInfo,
  type TimingResponse,
  type StateResponse,
  type FrameResponse,
  type ChannelMapResponse,
  type VarListResponse,
  type RtLabelsResponse,
  type RtBufferResponse,
  type TriggerResponse,
  type SnapshotHeaderResponse,
  type SnapshotDataResponse,
} from "./schemas";
import {
  Endianness,
  MessageType,
  State,
  TriggerMode,
  ErrorCode,
} from "./types";

// --- Error handling ---

/** Error thrown when device returns an error frame (TYPE = 0xFF). */
export class DeviceError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(`Device error: ${ErrorCode[code] ?? code}`);
    this.name = "DeviceError";
  }
}

/**
 * Check if response is a device error. Call first on any response.
 * @throws DeviceError if type is 0xFF
 */
export const checkForDeviceError = (
  type: number,
  payload: Uint8Array,
): void => {
  if (type === MessageType.ERROR) {
    if (payload.length < 1) {
      throw new Error("Malformed error response: missing error code");
    }
    throw new DeviceError(payload[0] as ErrorCode);
  }
};

const isLittleEndian = (endianness: Endianness): boolean =>
  endianness === Endianness.Little;

// --- Decode functions ---

/** Minimum payload size for GET_INFO response (without device name). */
const INFO_HEADER_SIZE = 10;

/**
 * Decode GET_INFO response. Returns DeviceInfo for use with other decoders.
 * Does not require existing DeviceInfo.
 */
export const decodeInfoResponse = (payload: Uint8Array): DeviceInfo => {
  if (payload.length < INFO_HEADER_SIZE) {
    throw new Error(
      `InfoResponse too short: ${payload.length} < ${INFO_HEADER_SIZE}`,
    );
  }

  const numChannels = readU8(payload, 0);
  const nameLen = readU8(payload, 8);
  const endiannessValue = readU8(payload, 9);
  if (
    endiannessValue !== Endianness.Little &&
    endiannessValue !== Endianness.Big
  ) {
    throw new Error(`InfoResponse invalid endianness: ${endiannessValue}`);
  }
  const endianness = endiannessValue as Endianness;
  const littleEndian = isLittleEndian(endianness);
  const bufferSize = readU16(payload, 1, littleEndian);
  const isrKhz = readU16(payload, 3, littleEndian);
  const varCount = readU8(payload, 5);
  const rtCount = readU8(payload, 6);
  const rtBufferLen = readU8(payload, 7);

  if (payload.length < INFO_HEADER_SIZE + nameLen) {
    throw new Error(
      `InfoResponse missing device name: ${payload.length} < ${INFO_HEADER_SIZE + nameLen}`,
    );
  }

  const deviceName = readStringFixed(payload, INFO_HEADER_SIZE, nameLen);

  return DeviceInfoSchema.parse({
    numChannels,
    bufferSize,
    isrKhz,
    varCount,
    rtCount,
    rtBufferLen,
    nameLen,
    endianness,
    deviceName,
  });
};

/** Decode GET_TIMING / SET_TIMING response. */
export const decodeTimingResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): TimingResponse => {
  if (payload.length < 8) {
    throw new Error(`TimingResponse too short: ${payload.length} < 8`);
  }
  const littleEndian = isLittleEndian(info.endianness);
  return TimingResponseSchema.parse({
    divider: readU32(payload, 0, littleEndian),
    preTrig: readU32(payload, 4, littleEndian),
  });
};

/** Decode GET_STATE / SET_STATE response. */
export const decodeStateResponse = (payload: Uint8Array): StateResponse => {
  if (payload.length < 1) {
    throw new Error(`StateResponse too short: ${payload.length} < 1`);
  }
  return StateResponseSchema.parse({
    state: readU8(payload, 0) as State,
  });
};

/** Decode TRIGGER response (empty payload). */
export const decodeTriggerResponse = (payload: Uint8Array): void => {
  // TRIGGER response has empty payload - just validate
  if (payload.length !== 0) {
    throw new Error(
      `TriggerResponse should be empty, got ${payload.length} bytes`,
    );
  }
};

/** Decode GET_FRAME response. Requires DeviceInfo for channel count. */
export const decodeFrameResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): FrameResponse => {
  const expected = info.numChannels * 4;
  if (payload.length !== expected) {
    throw new Error(
      `FrameResponse wrong size: ${payload.length} vs expected ${expected}`,
    );
  }
  const littleEndian = isLittleEndian(info.endianness);
  const values: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    values.push(readF32(payload, i * 4, littleEndian));
  }
  return FrameResponseSchema.parse({ values });
};

/** Decode GET_CHANNEL_MAP response. Requires DeviceInfo. */
export const decodeChannelMapResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): ChannelMapResponse => {
  if (payload.length !== info.numChannels) {
    throw new Error(
      `ChannelMapResponse wrong size: ${payload.length} vs expected ${info.numChannels}`,
    );
  }
  const varIds: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    varIds.push(readU8(payload, i));
  }
  return ChannelMapResponseSchema.parse({ varIds });
};

/** Response from SET_CHANNEL_MAP: echoes the updated single channel. */
export interface SetChannelMapResponse {
  channelIdx: number;
  catalogIdx: number;
}

const decodeNameListResponse = (
  payload: Uint8Array,
  nameLen: number,
  label: string,
): { totalCount: number; startIdx: number; names: string[] } => {
  if (payload.length < 3) {
    throw new Error(`${label} too short: ${payload.length} < 3`);
  }
  const totalCount = readU8(payload, 0);
  const startIdx = readU8(payload, 1);
  const count = readU8(payload, 2);

  const expectedDataLen = count * nameLen;
  if (payload.length !== 3 + expectedDataLen) {
    throw new Error(
      `${label} wrong size: ${payload.length} vs expected ${3 + expectedDataLen}`,
    );
  }

  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 3 + i * nameLen;
    names.push(readStringFixed(payload, offset, nameLen));
  }

  return { totalCount, startIdx, names };
};

/** Decode SET_CHANNEL_MAP response. Returns the echoed channel mapping. */
export const decodeSetChannelMapResponse = (
  payload: Uint8Array,
): SetChannelMapResponse => {
  if (payload.length !== 2) {
    throw new Error(
      `SetChannelMapResponse wrong size: ${payload.length} vs expected 2`,
    );
  }
  return {
    channelIdx: readU8(payload, 0),
    catalogIdx: readU8(payload, 1),
  };
};

/** Decode GET_VAR_LIST response. Requires DeviceInfo for name length. */
export const decodeVarListResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): VarListResponse => {
  const { totalCount, startIdx, names } = decodeNameListResponse(
    payload,
    info.nameLen,
    "VarListResponse",
  );
  return VarListResponseSchema.parse({ totalCount, startIdx, entries: names });
};

/** Decode GET_RT_LABELS response. Requires DeviceInfo for name length. */
export const decodeRtLabelsResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): RtLabelsResponse => {
  const { totalCount, startIdx, names } = decodeNameListResponse(
    payload,
    info.nameLen,
    "RtLabelsResponse",
  );
  return RtLabelsResponseSchema.parse({ totalCount, startIdx, entries: names });
};

/** Decode GET_RT_BUFFER / SET_RT_BUFFER response. */
export const decodeRtBufferResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): RtBufferResponse => {
  if (payload.length !== 4) {
    throw new Error(
      `RtBufferResponse wrong size: ${payload.length} vs expected 4`,
    );
  }
  const littleEndian = isLittleEndian(info.endianness);
  return RtBufferResponseSchema.parse({
    value: readF32(payload, 0, littleEndian),
  });
};

/** Decode GET_TRIGGER / SET_TRIGGER response. */
export const decodeTriggerParamsResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): TriggerResponse => {
  if (payload.length !== 6) {
    throw new Error(
      `TriggerResponse wrong size: ${payload.length} vs expected 6`,
    );
  }
  const littleEndian = isLittleEndian(info.endianness);
  return TriggerResponseSchema.parse({
    threshold: readF32(payload, 0, littleEndian),
    channel: readU8(payload, 4),
    mode: readU8(payload, 5) as TriggerMode,
  });
};

/** Decode GET_SNAPSHOT_HEADER response. Requires DeviceInfo. */
export const decodeSnapshotHeaderResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
): SnapshotHeaderResponse => {
  // Layout: channelMap[numChannels] + divider(4) + preTrig(4) + threshold(4) + channel(1) + mode(1) + rtValues[rtCount * 4]
  const headerFixedSize = info.numChannels + 4 + 4 + 4 + 1 + 1;
  const rtValuesSize = info.rtCount * 4;
  const expectedSize = headerFixedSize + rtValuesSize;

  if (payload.length !== expectedSize) {
    throw new Error(
      `SnapshotHeaderResponse wrong size: ${payload.length} vs expected ${expectedSize}`,
    );
  }

  let offset = 0;

  // Channel map
  const channelMap: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    channelMap.push(readU8(payload, offset++));
  }

  const littleEndian = isLittleEndian(info.endianness);

  // Timing
  const divider = readU32(payload, offset, littleEndian);
  offset += 4;
  const preTrig = readU32(payload, offset, littleEndian);
  offset += 4;

  // Trigger params
  const triggerThreshold = readF32(payload, offset, littleEndian);
  offset += 4;
  const triggerChannel = readU8(payload, offset++);
  const triggerMode = readU8(payload, offset++) as TriggerMode;

  // RT values
  const rtValues: number[] = [];
  for (let i = 0; i < info.rtCount; i++) {
    rtValues.push(readF32(payload, offset, littleEndian));
    offset += 4;
  }

  return SnapshotHeaderResponseSchema.parse({
    channelMap,
    divider,
    preTrig,
    triggerThreshold,
    triggerChannel,
    triggerMode,
    rtValues,
  });
};

/** Decode GET_SNAPSHOT_DATA response. Requires DeviceInfo and requested sample count. */
export const decodeSnapshotDataResponse = (
  payload: Uint8Array,
  info: DeviceInfo,
  sampleCount: number,
): SnapshotDataResponse => {
  const expectedSize = sampleCount * info.numChannels * 4;
  if (payload.length !== expectedSize) {
    throw new Error(
      `SnapshotDataResponse wrong size: ${payload.length} vs expected ${expectedSize}`,
    );
  }

  const samples: number[][] = [];
  const littleEndian = isLittleEndian(info.endianness);
  let offset = 0;
  for (let s = 0; s < sampleCount; s++) {
    const sample: number[] = [];
    for (let c = 0; c < info.numChannels; c++) {
      sample.push(readF32(payload, offset, littleEndian));
      offset += 4;
    }
    samples.push(sample);
  }

  return SnapshotDataResponseSchema.parse({ samples });
};

// --- Encode functions ---
// All encode functions return TYPE | PAYLOAD as Uint8Array

export const encodeGetInfoRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_INFO]);
};

export const encodeGetTimingRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_TIMING]);
};

export const encodeSetTimingRequest = (
  divider: number,
  preTrig: number,
  endianness: Endianness,
): Uint8Array => {
  const littleEndian = isLittleEndian(endianness);
  const buf = new Uint8Array(1 + 8); // TYPE + 4B divider + 4B preTrig
  buf[0] = MessageType.SET_TIMING;
  writeU32(buf, 1, divider, littleEndian);
  writeU32(buf, 5, preTrig, littleEndian);
  return buf;
};

export const encodeGetStateRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_STATE]);
};

export const encodeSetStateRequest = (state: State): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = MessageType.SET_STATE;
  writeU8(buf, 1, state);
  return buf;
};

export const encodeTriggerRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.TRIGGER]);
};

export const encodeGetFrameRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_FRAME]);
};

export const encodeGetSnapshotHeaderRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_SNAPSHOT_HEADER]);
};

export const encodeGetSnapshotDataRequest = (
  startSample: number,
  sampleCount: number,
  endianness: Endianness,
): Uint8Array => {
  const littleEndian = isLittleEndian(endianness);
  const buf = new Uint8Array(1 + 3); // TYPE + 2B start + 1B count
  buf[0] = MessageType.GET_SNAPSHOT_DATA;
  writeU16(buf, 1, startSample, littleEndian);
  writeU8(buf, 3, sampleCount);
  return buf;
};

export const encodeGetVarListRequest = (
  startIdx: number,
  maxCount: number,
): Uint8Array => {
  const buf = new Uint8Array(3);
  buf[0] = MessageType.GET_VAR_LIST;
  writeU8(buf, 1, startIdx);
  writeU8(buf, 2, maxCount);
  return buf;
};

export const encodeGetChannelMapRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_CHANNEL_MAP]);
};

export const encodeSetChannelMapRequest = (
  channelIdx: number,
  catalogIdx: number,
): Uint8Array => {
  const buf = new Uint8Array(3); // TYPE + channelIdx + catalogIdx
  buf[0] = MessageType.SET_CHANNEL_MAP;
  writeU8(buf, 1, channelIdx);
  writeU8(buf, 2, catalogIdx);
  return buf;
};

export const encodeGetRtLabelsRequest = (
  startIdx: number,
  maxCount: number,
): Uint8Array => {
  const buf = new Uint8Array(3);
  buf[0] = MessageType.GET_RT_LABELS;
  writeU8(buf, 1, startIdx);
  writeU8(buf, 2, maxCount);
  return buf;
};

export const encodeGetRtBufferRequest = (index: number): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = MessageType.GET_RT_BUFFER;
  writeU8(buf, 1, index);
  return buf;
};

export const encodeSetRtBufferRequest = (
  index: number,
  value: number,
  endianness: Endianness,
): Uint8Array => {
  const littleEndian = isLittleEndian(endianness);
  const buf = new Uint8Array(1 + 1 + 4); // TYPE + index + float
  buf[0] = MessageType.SET_RT_BUFFER;
  writeU8(buf, 1, index);
  writeF32(buf, 2, value, littleEndian);
  return buf;
};

export const encodeGetTriggerRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_TRIGGER]);
};

export const encodeSetTriggerRequest = (
  threshold: number,
  channel: number,
  mode: TriggerMode,
  endianness: Endianness,
): Uint8Array => {
  const littleEndian = isLittleEndian(endianness);
  const buf = new Uint8Array(1 + 6); // TYPE + float + u8 + u8
  buf[0] = MessageType.SET_TRIGGER;
  writeF32(buf, 1, threshold, littleEndian);
  writeU8(buf, 5, channel);
  writeU8(buf, 6, mode);
  return buf;
};
