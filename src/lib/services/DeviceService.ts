import { Context, Effect, Layer } from "effect";
import * as Tauri from "../tauri";
import {
  type DeviceError,
  type SerialError,
  fromCodecError,
  ProtocolError,
} from "../errors";
import type { PortFilter, PortInfo, SerialConfig } from "../types";
import { DeviceHandle } from "./DeviceHandle";
import {
  type DeviceInfo,
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
  State,
  TriggerMode,
  checkForDeviceError,
  decodeInfoResponse,
  decodeTimingResponse,
  decodeStateResponse,
  decodeTriggerResponse,
  decodeFrameResponse,
  decodeChannelMapResponse,
  decodeSetChannelMapResponse,
  type SetChannelMapResponse,
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
} from "../protocol";

/**
 * DeviceService shape - serial + protocol operations.
 */
export interface DeviceServiceShape {
  readonly listPorts: (
    filter?: PortFilter
  ) => Effect.Effect<PortInfo[], SerialError>;
  readonly openDevice: (
    path: string,
    config: SerialConfig
  ) => Effect.Effect<DeviceHandle, SerialError>;
  readonly closeDevice: (
    handle: DeviceHandle
  ) => Effect.Effect<void, SerialError>;
  readonly flushDevice: (
    handle: DeviceHandle
  ) => Effect.Effect<void, SerialError>;
  readonly getInfo: (
    handle: DeviceHandle
  ) => Effect.Effect<DeviceInfo, DeviceError>;
  readonly getTiming: (
    handle: DeviceHandle,
    info: DeviceInfo
  ) => Effect.Effect<TimingResponse, DeviceError>;
  readonly setTiming: (
    handle: DeviceHandle,
    info: DeviceInfo,
    divider: number,
    preTrig: number
  ) => Effect.Effect<void, DeviceError>;
  readonly getState: (
    handle: DeviceHandle
  ) => Effect.Effect<StateResponse, DeviceError>;
  readonly setState: (
    handle: DeviceHandle,
    state: State
  ) => Effect.Effect<void, DeviceError>;
  readonly trigger: (handle: DeviceHandle) => Effect.Effect<void, DeviceError>;
  readonly getFrame: (
    handle: DeviceHandle,
    info: DeviceInfo
  ) => Effect.Effect<FrameResponse, DeviceError>;
  readonly getChannelMap: (
    handle: DeviceHandle,
    info: DeviceInfo
  ) => Effect.Effect<ChannelMapResponse, DeviceError>;
  readonly setChannelMap: (
    handle: DeviceHandle,
    channelIdx: number,
    catalogIdx: number
  ) => Effect.Effect<SetChannelMapResponse, DeviceError>;
  readonly getChannelLabels: (
    handle: DeviceHandle,
    info: DeviceInfo,
    start: number,
    max: number
  ) => Effect.Effect<ChannelLabelsResponse, DeviceError>;
  readonly getVarList: (
    handle: DeviceHandle,
    info: DeviceInfo,
    start: number,
    max: number
  ) => Effect.Effect<VarListResponse, DeviceError>;
  readonly getRtLabels: (
    handle: DeviceHandle,
    info: DeviceInfo,
    start: number,
    max: number
  ) => Effect.Effect<RtLabelsResponse, DeviceError>;
  readonly getRtBuffer: (
    handle: DeviceHandle,
    info: DeviceInfo,
    index: number
  ) => Effect.Effect<RtBufferResponse, DeviceError>;
  readonly setRtBuffer: (
    handle: DeviceHandle,
    info: DeviceInfo,
    index: number,
    value: number
  ) => Effect.Effect<void, DeviceError>;
  readonly getTrigger: (
    handle: DeviceHandle,
    info: DeviceInfo
  ) => Effect.Effect<TriggerResponse, DeviceError>;
  readonly setTrigger: (
    handle: DeviceHandle,
    info: DeviceInfo,
    threshold: number,
    channel: number,
    mode: TriggerMode
  ) => Effect.Effect<void, DeviceError>;
  readonly getSnapshotHeader: (
    handle: DeviceHandle,
    info: DeviceInfo
  ) => Effect.Effect<SnapshotHeaderResponse, DeviceError>;
  readonly getSnapshotData: (
    handle: DeviceHandle,
    info: DeviceInfo,
    start: number,
    count: number
  ) => Effect.Effect<SnapshotDataResponse, DeviceError>;
}

/**
 * DeviceService tag for dependency injection.
 */
export class DeviceService extends Context.Tag("DeviceService")<
  DeviceService,
  DeviceServiceShape
>() {}

/**
 * Helper: send protocol request and decode response.
 */
const makeProtocolRequest = <T>(
  handle: DeviceHandle,
  encode: () => Uint8Array,
  decode: (payload: Uint8Array) => T
): Effect.Effect<T, DeviceError> =>
  Effect.gen(function* () {
    const request = encode();
    const response = yield* Tauri.sendRequest(handle, request);

    if (response.length === 0) {
      return yield* Effect.fail(
        ProtocolError.DecodeError({ message: "empty response" })
      );
    }

    // Response format: TYPE(1) | PAYLOAD(rest)
    const type = response[0];
    const payload = response.subarray(1);

    // Check for device error and decode
    return yield* Effect.try({
      try: () => {
        checkForDeviceError(type, payload);
        return decode(payload);
      },
      catch: fromCodecError,
    });
  });

/**
 * Live implementation of DeviceService.
 */
export const DeviceServiceLive = Layer.succeed(DeviceService, {
  listPorts: (filter) => Tauri.listPorts(filter),

  openDevice: (path, config) =>
    Tauri.openDevice(path, config).pipe(Effect.map((id) => DeviceHandle(id))),

  closeDevice: (handle) => Tauri.closeDevice(handle),

  flushDevice: (handle) => Tauri.flushDevice(handle),

  getInfo: (handle) =>
    makeProtocolRequest(handle, encodeGetInfoRequest, decodeInfoResponse),

  getTiming: (handle, info) =>
    makeProtocolRequest(handle, encodeGetTimingRequest, (payload) =>
      decodeTimingResponse(payload, info)
    ),

  setTiming: (handle, info, divider, preTrig) =>
    makeProtocolRequest(
      handle,
      () => encodeSetTimingRequest(divider, preTrig, info.endianness),
      () => undefined
    ),

  getState: (handle) =>
    makeProtocolRequest(handle, encodeGetStateRequest, decodeStateResponse),

  setState: (handle, state) =>
    makeProtocolRequest(
      handle,
      () => encodeSetStateRequest(state),
      () => undefined
    ),

  trigger: (handle) =>
    makeProtocolRequest(handle, encodeTriggerRequest, decodeTriggerResponse),

  getFrame: (handle, info) =>
    makeProtocolRequest(handle, encodeGetFrameRequest, (payload) =>
      decodeFrameResponse(payload, info)
    ),

  getChannelMap: (handle, info) =>
    makeProtocolRequest(handle, encodeGetChannelMapRequest, (payload) =>
      decodeChannelMapResponse(payload, info)
    ),

  setChannelMap: (handle, channelIdx, catalogIdx) =>
    makeProtocolRequest(
      handle,
      () => encodeSetChannelMapRequest(channelIdx, catalogIdx),
      decodeSetChannelMapResponse
    ),

  getChannelLabels: (handle, info, start, max) =>
    makeProtocolRequest(
      handle,
      () => encodeGetChannelLabelsRequest(start, max),
      (payload) => decodeChannelLabelsResponse(payload, info)
    ),

  getVarList: (handle, info, start, max) =>
    makeProtocolRequest(
      handle,
      () => encodeGetVarListRequest(start, max),
      (payload) => decodeVarListResponse(payload, info)
    ),

  getRtLabels: (handle, info, start, max) =>
    makeProtocolRequest(
      handle,
      () => encodeGetRtLabelsRequest(start, max),
      (payload) => decodeRtLabelsResponse(payload, info)
    ),

  getRtBuffer: (handle, info, index) =>
    makeProtocolRequest(
      handle,
      () => encodeGetRtBufferRequest(index),
      (payload) => decodeRtBufferResponse(payload, info)
    ),

  setRtBuffer: (handle, info, index, value) =>
    makeProtocolRequest(
      handle,
      () => encodeSetRtBufferRequest(index, value, info.endianness),
      () => undefined
    ),

  getTrigger: (handle, info) =>
    makeProtocolRequest(
      handle,
      encodeGetTriggerRequest,
      (payload) => decodeTriggerParamsResponse(payload, info)
    ),

  setTrigger: (handle, info, threshold, channel, mode) =>
    makeProtocolRequest(
      handle,
      () => encodeSetTriggerRequest(threshold, channel, mode, info.endianness),
      () => undefined
    ),

  getSnapshotHeader: (handle, info) =>
    makeProtocolRequest(handle, encodeGetSnapshotHeaderRequest, (payload) =>
      decodeSnapshotHeaderResponse(payload, info)
    ),

  getSnapshotData: (handle, info, start, count) =>
    makeProtocolRequest(
      handle,
      () => encodeGetSnapshotDataRequest(start, count, info.endianness),
      (payload) => decodeSnapshotDataResponse(payload, info, count)
    ),
});
