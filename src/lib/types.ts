import { z } from "zod";

// TODO(vscope): Rust expects serialport enum encoding for dataBits/parity/stopBits (serde).
export const SerialConfigSchema = z.object({
  baudRate: z.number().int().positive(),
  dataBits: z.enum(["5", "6", "7", "8"]),
  parity: z.enum(["none", "odd", "even"]),
  stopBits: z.enum(["1", "2"]),
  readTimeoutMs: z.number().int().nonnegative(),
});

export type SerialConfig = z.infer<typeof SerialConfigSchema>;

export const PortFilterSchema = z.object({
  vid: z.number().int().min(0).max(0xffff).optional(),
  pid: z.number().int().min(0).max(0xffff).optional(),
  nameSubstr: z.string().min(1).optional(),
});

export type PortFilter = z.infer<typeof PortFilterSchema>;

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

export const CloseDeviceInputSchema = z.object({
  handleId: z.number().int().positive(),
});

export type CloseDeviceInput = z.infer<typeof CloseDeviceInputSchema>;

export const FlushDeviceInputSchema = CloseDeviceInputSchema;

export type FlushDeviceInput = z.infer<typeof FlushDeviceInputSchema>;

export const SendRequestInputSchema = z.object({
  handleId: z.number().int().positive(),
  payload: z.array(z.number().int().min(0).max(255)).min(1),
});

export type SendRequestInput = z.infer<typeof SendRequestInputSchema>;
