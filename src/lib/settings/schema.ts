import { z } from "zod";
import { SerialConfigSchema } from "../transport/serial.schema";

export const RecentPortSchema = z.object({
  path: z.string(),
  lastConnected: z.number(), // timestamp
  lastConfig: SerialConfigSchema.optional(),
});

export const SettingsSchema = z.object({
  statePollingHz: z.number().int().min(1).max(100),
  framePollingHz: z.number().int().min(1).max(50),
  frameTimeoutMs: z.number().int().min(10).max(5000),
  // UI note: restart required to apply (runtime reads at startup).
  crcRetryAttempts: z.number().int().min(1).max(10),
  liveBufferDurationS: z.number().min(1).max(300),
  defaultSerialConfig: SerialConfigSchema,
  recentPorts: z.array(RecentPortSchema),
  snapshotAutoSave: z.boolean(),
  snapshotGcDays: z.union([
    z.number().int().min(1).max(365),
    z.literal("never"),
  ]),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type RecentPort = z.infer<typeof RecentPortSchema>;
export type SnapshotGcDays = Settings["snapshotGcDays"];
