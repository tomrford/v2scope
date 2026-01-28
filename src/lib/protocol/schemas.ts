/**
 * Zod schemas for protocol messages.
 * Shape validation only - length constraints are handled in codec.ts
 * based on DeviceInfo values.
 */

import { z } from "zod";
import { Endianness, State, TriggerMode } from "./types";

export const DeviceInfoSchema = z.object({
  numChannels: z.number().int().nonnegative(),
  bufferSize: z.number().int().nonnegative(),
  isrKhz: z.number().int().nonnegative(),
  varCount: z.number().int().nonnegative(),
  rtCount: z.number().int().nonnegative(),
  rtBufferLen: z.number().int().nonnegative(),
  nameLen: z.number().int().nonnegative(),
  endianness: z.enum(Endianness),
  deviceName: z.string(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

// --- Response schemas ---

export const TimingResponseSchema = z.object({
  divider: z.number().int().nonnegative(),
  preTrig: z.number().int().nonnegative(),
});
export type TimingResponse = z.infer<typeof TimingResponseSchema>;

export const StateResponseSchema = z.object({
  state: z.enum(State),
});
export type StateResponse = z.infer<typeof StateResponseSchema>;

export const FrameResponseSchema = z.object({
  values: z.array(z.number()),
});
export type FrameResponse = z.infer<typeof FrameResponseSchema>;

export const ChannelMapResponseSchema = z.object({
  varIds: z.array(z.number().int().nonnegative()),
});
export type ChannelMapResponse = z.infer<typeof ChannelMapResponseSchema>;

export const VarListEntrySchema = z.string();
export type VarListEntry = z.infer<typeof VarListEntrySchema>;

export const VarListResponseSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  startIdx: z.number().int().nonnegative(),
  entries: z.array(VarListEntrySchema),
});
export type VarListResponse = z.infer<typeof VarListResponseSchema>;

export const RtLabelsResponseSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  startIdx: z.number().int().nonnegative(),
  entries: z.array(VarListEntrySchema),
});
export type RtLabelsResponse = z.infer<typeof RtLabelsResponseSchema>;

export const RtBufferResponseSchema = z.object({
  value: z.number(),
});
export type RtBufferResponse = z.infer<typeof RtBufferResponseSchema>;

export const TriggerResponseSchema = z.object({
  threshold: z.number(),
  channel: z.number().int().nonnegative(),
  mode: z.enum(TriggerMode),
});
export type TriggerResponse = z.infer<typeof TriggerResponseSchema>;

export const SnapshotHeaderResponseSchema = z.object({
  channelMap: z.array(z.number().int().nonnegative()),
  divider: z.number().int().nonnegative(),
  preTrig: z.number().int().nonnegative(),
  triggerThreshold: z.number(),
  triggerChannel: z.number().int().nonnegative(),
  triggerMode: z.enum(TriggerMode),
  rtValues: z.array(z.number()),
});
export type SnapshotHeaderResponse = z.infer<
  typeof SnapshotHeaderResponseSchema
>;

export const SnapshotDataResponseSchema = z.object({
  samples: z.array(z.array(z.number())), // samples[sample_idx][channel_idx]
});
export type SnapshotDataResponse = z.infer<typeof SnapshotDataResponseSchema>;

// --- Request schemas (for input validation before encoding) ---

export const SetTimingRequestSchema = z.object({
  divider: z.number().int().positive(),
  preTrig: z.number().int().nonnegative(),
});
export type SetTimingRequest = z.infer<typeof SetTimingRequestSchema>;

export const SetStateRequestSchema = z.object({
  state: z.enum(State),
});
export type SetStateRequest = z.infer<typeof SetStateRequestSchema>;

export const SetChannelMapRequestSchema = z.object({
  channelIdx: z.number().int().nonnegative(),
  catalogIdx: z.number().int().nonnegative(),
});
export type SetChannelMapRequest = z.infer<typeof SetChannelMapRequestSchema>;

export const GetSnapshotDataRequestSchema = z.object({
  startSample: z.number().int().nonnegative(),
  sampleCount: z.number().int().positive(),
});
export type GetSnapshotDataRequest = z.infer<
  typeof GetSnapshotDataRequestSchema
>;

export const GetVarListRequestSchema = z.object({
  startIdx: z.number().int().nonnegative(),
  maxCount: z.number().int().positive(),
});
export type GetVarListRequest = z.infer<typeof GetVarListRequestSchema>;

export const GetRtLabelsRequestSchema = z.object({
  startIdx: z.number().int().nonnegative(),
  maxCount: z.number().int().positive(),
});
export type GetRtLabelsRequest = z.infer<typeof GetRtLabelsRequestSchema>;

export const GetRtBufferRequestSchema = z.object({
  index: z.number().int().nonnegative(),
});
export type GetRtBufferRequest = z.infer<typeof GetRtBufferRequestSchema>;

export const SetRtBufferRequestSchema = z.object({
  index: z.number().int().nonnegative(),
  value: z.number(),
});
export type SetRtBufferRequest = z.infer<typeof SetRtBufferRequestSchema>;

export const SetTriggerRequestSchema = z.object({
  threshold: z.number(),
  channel: z.number().int().nonnegative(),
  mode: z.enum(TriggerMode),
});
export type SetTriggerRequest = z.infer<typeof SetTriggerRequestSchema>;
