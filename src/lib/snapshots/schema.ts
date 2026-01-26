import { z } from "zod";
import { SnapshotHeaderResponseSchema } from "../protocol/schemas";

export const SnapshotMetaSchema = SnapshotHeaderResponseSchema.extend({
  id: z.number(),
  name: z.string(),
  deviceNames: z.array(z.string()).min(1),
  channelCount: z.number().int().positive(),
  sampleCount: z.number().int().positive(),
  createdAt: z.string(),
});

export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;
