import { z } from "zod";

/**
 * Snapshot metadata - serialized to JSON on disk.
 */
export const SnapshotMetaSchema = z.object({
  id: z.number(), // timestamp ms
  name: z.string().optional(), // user-provided name
  deviceNames: z.array(z.string()).min(1), // ordered list of devices
  channelCount: z.number().int().positive(),
  sampleCount: z.number().int().positive(),
  divider: z.number().int().positive(),
  preTrig: z.number().int().nonnegative(),
  triggerParams: z.array(z.number()),
  rtValues: z.array(z.number()),
  createdAt: z.string(), // ISO timestamp
});

export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

/**
 * Store entry - in-memory representation.
 * data is null for persisted snapshots until lazy-loaded.
 */
export type SnapshotEntry = {
  meta: SnapshotMeta;
  data: Float32Array | null; // null = lazy, not yet loaded
  persisted: boolean; // true = saved to disk
};
