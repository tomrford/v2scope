import { z } from "zod";
import { SerialConfigSchema } from "../transport/serial.schema";

export const SavedPortSchema = z.object({
  path: z.string(),
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
  activePorts: z.array(z.string()),
  savedPorts: z.array(SavedPortSchema),
  snapshotAutoSave: z.boolean(),
  snapshotGcDays: z.union([
    z.number().int().min(1).max(365),
    z.literal("never"),
  ]),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type SavedPort = z.infer<typeof SavedPortSchema>;
export type SnapshotGcDays = Settings["snapshotGcDays"];
