import { z } from "zod";
import { SerialConfigSchema } from "../transport/serial.schema";

export const SavedPortSchema = z.object({
  path: z.string(),
  lastConfig: SerialConfigSchema.optional(),
});

export type SavedPort = z.infer<typeof SavedPortSchema>;
