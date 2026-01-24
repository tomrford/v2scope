import { Brand } from "effect";

/**
 * Branded type for device handles from Rust.
 * Prevents accidental use of arbitrary numbers as handles.
 */
export type DeviceHandle = number & Brand.Brand<"DeviceHandle">;

export const DeviceHandle = Brand.nominal<DeviceHandle>();
