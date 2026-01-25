import { z } from "zod";

export const SerialConfigSchema = z.object({
  baudRate: z.number().int().positive(),
  dataBits: z.enum(["Five", "Six", "Seven", "Eight"]),
  parity: z.enum(["None", "Odd", "Even"]),
  stopBits: z.enum(["One", "Two"]),
  readTimeoutMs: z.number().int().nonnegative(),
});
export type SerialConfig = z.infer<typeof SerialConfigSchema>;

export const PortInfoSchema = z.object({
  path: z.string(),
  vid: z.number().int().nullable(),
  pid: z.number().int().nullable(),
  manufacturer: z.string().nullable(),
  product: z.string().nullable(),
  serialNumber: z.string().nullable(),
  portType: z.enum(["usb", "bluetooth", "pci", "unknown"]),
});
export type PortInfo = z.infer<typeof PortInfoSchema>;

export const OpenDeviceInputSchema = z.object({
  path: z.string().min(1),
  config: SerialConfigSchema,
});
export type OpenDeviceInput = z.infer<typeof OpenDeviceInputSchema>;

const HandleIdSchema = z.object({
  handleId: z.number().int().positive(),
});
export type CloseDeviceInput = z.infer<typeof HandleIdSchema>;
export type FlushDeviceInput = z.infer<typeof HandleIdSchema>;

export const SendRequestInputSchema = HandleIdSchema.extend({
  payload: z.array(z.number().int().min(0).max(255)).min(1),
});
export type SendRequestInput = z.infer<typeof SendRequestInputSchema>;
