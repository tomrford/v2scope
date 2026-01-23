/**
 * Protocol encode/decode functions.
 * Pure functions that throw on invalid data.
 * Effect wrapping happens at the boundary (e.g., device.ts).
 */

import {
  readU8,
  readU16LE,
  readU32LE,
  readF32LE,
  readStringFixed,
  writeU8,
  writeU16LE,
  writeU32LE,
  writeF32LE,
} from "./bytes";
import type { DeviceInfo } from "./device-info";
import {
  TimingResponseSchema,
  StateResponseSchema,
  FrameResponseSchema,
  ChannelMapResponseSchema,
  ChannelLabelsResponseSchema,
  VarListResponseSchema,
  RtLabelsResponseSchema,
  RtBufferResponseSchema,
  TriggerResponseSchema,
  SnapshotHeaderResponseSchema,
  SnapshotDataResponseSchema,
  type TimingResponse,
  type StateResponse,
  type FrameResponse,
  type ChannelMapResponse,
  type ChannelLabelsResponse,
  type VarListResponse,
  type RtLabelsResponse,
  type RtBufferResponse,
  type TriggerResponse,
  type SnapshotHeaderResponse,
  type SnapshotDataResponse,
} from "./schemas";
import { MessageType, State, TriggerMode, ErrorCode } from "./types";

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
export const checkForDeviceError = (type: number, payload: Uint8Array): void => {
  if (type === MessageType.ERROR) {
    if (payload.length < 1) {
      throw new Error("Malformed error response: missing error code");
    }
    throw new DeviceError(payload[0] as ErrorCode);
  }
};

// --- Decode functions ---

/** Minimum payload size for GET_INFO response (without device name). */
const INFO_HEADER_SIZE = 10;

/**
 * Decode GET_INFO response. Returns DeviceInfo for use with other decoders.
 * Does not require existing DeviceInfo.
 */
export const decodeInfoResponse = (payload: Uint8Array): DeviceInfo => {
  if (payload.length < INFO_HEADER_SIZE) {
    throw new Error(`InfoResponse too short: ${payload.length} < ${INFO_HEADER_SIZE}`);
  }

  const protocolVersion = readU8(payload, 0);
  const numChannels = readU8(payload, 1);
  const bufferSize = readU16LE(payload, 2);
  const isrKhz = readU16LE(payload, 4);
  const varCount = readU8(payload, 6);
  const rtCount = readU8(payload, 7);
  const rtBufferLen = readU8(payload, 8);
  const nameLen = readU8(payload, 9);

  if (payload.length < INFO_HEADER_SIZE + nameLen) {
    throw new Error(
      `InfoResponse missing device name: ${payload.length} < ${INFO_HEADER_SIZE + nameLen}`
    );
  }

  const deviceName = readStringFixed(payload, INFO_HEADER_SIZE, nameLen);

  return {
    protocolVersion,
    numChannels,
    bufferSize,
    isrKhz,
    varCount,
    rtCount,
    rtBufferLen,
    nameLen,
    deviceName,
  };
};

/** Decode GET_TIMING / SET_TIMING response. */
export const decodeTimingResponse = (payload: Uint8Array): TimingResponse => {
  if (payload.length < 8) {
    throw new Error(`TimingResponse too short: ${payload.length} < 8`);
  }
  return TimingResponseSchema.parse({
    divider: readU32LE(payload, 0),
    preTrig: readU32LE(payload, 4),
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
    throw new Error(`TriggerResponse should be empty, got ${payload.length} bytes`);
  }
};

/** Decode GET_FRAME response. Requires DeviceInfo for channel count. */
export const decodeFrameResponse = (payload: Uint8Array, info: DeviceInfo): FrameResponse => {
  const expected = info.numChannels * 4;
  if (payload.length !== expected) {
    throw new Error(`FrameResponse wrong size: ${payload.length} vs expected ${expected}`);
  }
  const values: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    values.push(readF32LE(payload, i * 4));
  }
  return FrameResponseSchema.parse({ values });
};

/** Decode GET_CHANNEL_MAP / SET_CHANNEL_MAP response. Requires DeviceInfo. */
export const decodeChannelMapResponse = (
  payload: Uint8Array,
  info: DeviceInfo
): ChannelMapResponse => {
  if (payload.length !== info.numChannels) {
    throw new Error(
      `ChannelMapResponse wrong size: ${payload.length} vs expected ${info.numChannels}`
    );
  }
  const varIds: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    varIds.push(readU8(payload, i));
  }
  return ChannelMapResponseSchema.parse({ varIds });
};

/** Decode GET_CHANNEL_LABELS response. Requires DeviceInfo. */
export const decodeChannelLabelsResponse = (
  payload: Uint8Array,
  info: DeviceInfo
): ChannelLabelsResponse => {
  const expected = info.numChannels * info.nameLen;
  if (payload.length !== expected) {
    throw new Error(`ChannelLabelsResponse wrong size: ${payload.length} vs expected ${expected}`);
  }
  const labels: string[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    labels.push(readStringFixed(payload, i * info.nameLen, info.nameLen));
  }
  return ChannelLabelsResponseSchema.parse({ labels });
};

/** Decode GET_VAR_LIST response. Requires DeviceInfo for name length. */
export const decodeVarListResponse = (payload: Uint8Array, info: DeviceInfo): VarListResponse => {
  if (payload.length < 3) {
    throw new Error(`VarListResponse too short: ${payload.length} < 3`);
  }
  const totalCount = readU8(payload, 0);
  const startIdx = readU8(payload, 1);
  const count = readU8(payload, 2);

  const entrySize = 1 + info.nameLen; // id + name
  const expectedDataLen = count * entrySize;
  if (payload.length !== 3 + expectedDataLen) {
    throw new Error(`VarListResponse wrong size: ${payload.length} vs expected ${3 + expectedDataLen}`);
  }

  const entries: { id: number; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 3 + i * entrySize;
    entries.push({
      id: readU8(payload, offset),
      name: readStringFixed(payload, offset + 1, info.nameLen),
    });
  }

  return VarListResponseSchema.parse({ totalCount, startIdx, entries });
};

/** Decode GET_RT_LABELS response. Requires DeviceInfo for name length. */
export const decodeRtLabelsResponse = (payload: Uint8Array, info: DeviceInfo): RtLabelsResponse => {
  if (payload.length < 3) {
    throw new Error(`RtLabelsResponse too short: ${payload.length} < 3`);
  }
  const totalCount = readU8(payload, 0);
  const startIdx = readU8(payload, 1);
  const count = readU8(payload, 2);

  const entrySize = 1 + info.nameLen;
  const expectedDataLen = count * entrySize;
  if (payload.length !== 3 + expectedDataLen) {
    throw new Error(
      `RtLabelsResponse wrong size: ${payload.length} vs expected ${3 + expectedDataLen}`
    );
  }

  const entries: { id: number; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 3 + i * entrySize;
    entries.push({
      id: readU8(payload, offset),
      name: readStringFixed(payload, offset + 1, info.nameLen),
    });
  }

  return RtLabelsResponseSchema.parse({ totalCount, startIdx, entries });
};

/** Decode GET_RT_BUFFER / SET_RT_BUFFER response. */
export const decodeRtBufferResponse = (payload: Uint8Array): RtBufferResponse => {
  if (payload.length !== 4) {
    throw new Error(`RtBufferResponse wrong size: ${payload.length} vs expected 4`);
  }
  return RtBufferResponseSchema.parse({
    value: readF32LE(payload, 0),
  });
};

/** Decode GET_TRIGGER / SET_TRIGGER response. */
export const decodeTriggerParamsResponse = (payload: Uint8Array): TriggerResponse => {
  if (payload.length !== 6) {
    throw new Error(`TriggerResponse wrong size: ${payload.length} vs expected 6`);
  }
  return TriggerResponseSchema.parse({
    threshold: readF32LE(payload, 0),
    channel: readU8(payload, 4),
    mode: readU8(payload, 5) as TriggerMode,
  });
};

/** Decode GET_SNAPSHOT_HEADER response. Requires DeviceInfo. */
export const decodeSnapshotHeaderResponse = (
  payload: Uint8Array,
  info: DeviceInfo
): SnapshotHeaderResponse => {
  // Layout: channelMap[numChannels] + divider(4) + preTrig(4) + threshold(4) + channel(1) + mode(1) + rtValues[rtCount * 4]
  const headerFixedSize = info.numChannels + 4 + 4 + 4 + 1 + 1;
  const rtValuesSize = info.rtCount * 4;
  const expectedSize = headerFixedSize + rtValuesSize;

  if (payload.length !== expectedSize) {
    throw new Error(`SnapshotHeaderResponse wrong size: ${payload.length} vs expected ${expectedSize}`);
  }

  let offset = 0;

  // Channel map
  const channelMap: number[] = [];
  for (let i = 0; i < info.numChannels; i++) {
    channelMap.push(readU8(payload, offset++));
  }

  // Timing
  const divider = readU32LE(payload, offset);
  offset += 4;
  const preTrig = readU32LE(payload, offset);
  offset += 4;

  // Trigger params
  const triggerThreshold = readF32LE(payload, offset);
  offset += 4;
  const triggerChannel = readU8(payload, offset++);
  const triggerMode = readU8(payload, offset++) as TriggerMode;

  // RT values
  const rtValues: number[] = [];
  for (let i = 0; i < info.rtCount; i++) {
    rtValues.push(readF32LE(payload, offset));
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
  sampleCount: number
): SnapshotDataResponse => {
  const expectedSize = sampleCount * info.numChannels * 4;
  if (payload.length !== expectedSize) {
    throw new Error(`SnapshotDataResponse wrong size: ${payload.length} vs expected ${expectedSize}`);
  }

  const samples: number[][] = [];
  let offset = 0;
  for (let s = 0; s < sampleCount; s++) {
    const sample: number[] = [];
    for (let c = 0; c < info.numChannels; c++) {
      sample.push(readF32LE(payload, offset));
      offset += 4;
    }
    samples.push(sample);
  }

  return SnapshotDataResponseSchema.parse({ samples });
};

// --- Encode functions ---
// All encode functions return TYPE | PAYLOAD as Uint8Array

/** Encode GET_INFO request. */
export const encodeGetInfoRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_INFO]);
};

/** Encode GET_TIMING request. */
export const encodeGetTimingRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_TIMING]);
};

/** Encode SET_TIMING request. */
export const encodeSetTimingRequest = (divider: number, preTrig: number): Uint8Array => {
  const buf = new Uint8Array(1 + 8); // TYPE + 4B divider + 4B preTrig
  buf[0] = MessageType.SET_TIMING;
  writeU32LE(buf, 1, divider);
  writeU32LE(buf, 5, preTrig);
  return buf;
};

/** Encode GET_STATE request. */
export const encodeGetStateRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_STATE]);
};

/** Encode SET_STATE request. */
export const encodeSetStateRequest = (state: State): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = MessageType.SET_STATE;
  writeU8(buf, 1, state);
  return buf;
};

/** Encode TRIGGER request. */
export const encodeTriggerRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.TRIGGER]);
};

/** Encode GET_FRAME request. */
export const encodeGetFrameRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_FRAME]);
};

/** Encode GET_SNAPSHOT_HEADER request. */
export const encodeGetSnapshotHeaderRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_SNAPSHOT_HEADER]);
};

/** Encode GET_SNAPSHOT_DATA request. */
export const encodeGetSnapshotDataRequest = (startSample: number, sampleCount: number): Uint8Array => {
  const buf = new Uint8Array(1 + 3); // TYPE + 2B start + 1B count
  buf[0] = MessageType.GET_SNAPSHOT_DATA;
  writeU16LE(buf, 1, startSample);
  writeU8(buf, 3, sampleCount);
  return buf;
};

/** Encode GET_VAR_LIST request. */
export const encodeGetVarListRequest = (startIdx?: number, maxCount?: number): Uint8Array => {
  if (startIdx === undefined && maxCount === undefined) {
    return new Uint8Array([MessageType.GET_VAR_LIST]);
  }
  const buf = new Uint8Array(3);
  buf[0] = MessageType.GET_VAR_LIST;
  writeU8(buf, 1, startIdx ?? 0);
  writeU8(buf, 2, maxCount ?? 255);
  return buf;
};

/** Encode GET_CHANNEL_MAP request. */
export const encodeGetChannelMapRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_CHANNEL_MAP]);
};

/** Encode SET_CHANNEL_MAP request. */
export const encodeSetChannelMapRequest = (varIds: number[]): Uint8Array => {
  const buf = new Uint8Array(1 + varIds.length);
  buf[0] = MessageType.SET_CHANNEL_MAP;
  for (let i = 0; i < varIds.length; i++) {
    writeU8(buf, 1 + i, varIds[i]);
  }
  return buf;
};

/** Encode GET_CHANNEL_LABELS request. */
export const encodeGetChannelLabelsRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_CHANNEL_LABELS]);
};

/** Encode GET_RT_LABELS request. */
export const encodeGetRtLabelsRequest = (startIdx?: number, maxCount?: number): Uint8Array => {
  if (startIdx === undefined && maxCount === undefined) {
    return new Uint8Array([MessageType.GET_RT_LABELS]);
  }
  const buf = new Uint8Array(3);
  buf[0] = MessageType.GET_RT_LABELS;
  writeU8(buf, 1, startIdx ?? 0);
  writeU8(buf, 2, maxCount ?? 255);
  return buf;
};

/** Encode GET_RT_BUFFER request. */
export const encodeGetRtBufferRequest = (index: number): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = MessageType.GET_RT_BUFFER;
  writeU8(buf, 1, index);
  return buf;
};

/** Encode SET_RT_BUFFER request. */
export const encodeSetRtBufferRequest = (index: number, value: number): Uint8Array => {
  const buf = new Uint8Array(1 + 1 + 4); // TYPE + index + float
  buf[0] = MessageType.SET_RT_BUFFER;
  writeU8(buf, 1, index);
  writeF32LE(buf, 2, value);
  return buf;
};

/** Encode GET_TRIGGER request. */
export const encodeGetTriggerRequest = (): Uint8Array => {
  return new Uint8Array([MessageType.GET_TRIGGER]);
};

/** Encode SET_TRIGGER request. */
export const encodeSetTriggerRequest = (
  threshold: number,
  channel: number,
  mode: TriggerMode
): Uint8Array => {
  const buf = new Uint8Array(1 + 6); // TYPE + float + u8 + u8
  buf[0] = MessageType.SET_TRIGGER;
  writeF32LE(buf, 1, threshold);
  writeU8(buf, 5, channel);
  writeU8(buf, 6, mode);
  return buf;
};
