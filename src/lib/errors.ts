import { Data } from "effect";
import { DeviceError as CodecDeviceError, ErrorCode } from "./protocol";

/* eslint-disable @typescript-eslint/no-empty-object-type -- Effect TaggedEnum requires {} for data-less variants */
export type SerialError = Data.TaggedEnum<{
  PortNotFound: { readonly path: string };
  PortBusy: { readonly path: string };
  InvalidHandle: { readonly handleId: number };
  Timeout: {};
  IoError: { readonly message: string };
  InvalidConfig: { readonly message: string };
  PayloadTooLarge: {};
}>;

export const SerialError = Data.taggedEnum<SerialError>();

/**
 * Protocol-level errors returned by the device.
 */
export type ProtocolError = Data.TaggedEnum<{
  BadLen: {};
  BadParam: {};
  Range: {};
  NotReady: {};
  DecodeError: { readonly message: string };
}>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

export const ProtocolError = Data.taggedEnum<ProtocolError>();

/**
 * Convert codec DeviceError (thrown) to Effect ProtocolError.
 */
export const fromCodecError = (e: unknown): ProtocolError => {
  if (e instanceof CodecDeviceError) {
    switch (e.code) {
      case ErrorCode.BAD_LEN:
        return ProtocolError.BadLen();
      case ErrorCode.BAD_PARAM:
        return ProtocolError.BadParam();
      case ErrorCode.RANGE:
        return ProtocolError.Range();
      case ErrorCode.NOT_READY:
        return ProtocolError.NotReady();
    }
  }
  const message =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : "unknown error";
  return ProtocolError.DecodeError({ message });
};

/**
 * Combined error type for device operations.
 */
export type DeviceError = SerialError | ProtocolError;

interface RustSerialError {
  type: string;
  data?: Record<string, unknown>;
}

export const parseSerialError = (e: unknown): SerialError => {
  // Try to parse as structured JSON from Rust
  if (typeof e === "object" && e !== null && "type" in e) {
    const rustErr = e as RustSerialError;
    switch (rustErr.type) {
      case "PortNotFound":
        return SerialError.PortNotFound({
          path: String(rustErr.data?.path ?? "unknown"),
        });
      case "PortBusy":
        return SerialError.PortBusy({
          path: String(rustErr.data?.path ?? "unknown"),
        });
      case "InvalidHandle":
        return SerialError.InvalidHandle({
          handleId: Number(rustErr.data?.handle_id ?? 0),
        });
      case "Timeout":
        return SerialError.Timeout();
      case "IoError":
        return SerialError.IoError({
          message: String(rustErr.data?.message ?? "unknown io error"),
        });
      case "InvalidConfig":
        return SerialError.InvalidConfig({
          message: String(rustErr.data?.message ?? "unknown config error"),
        });
      case "PayloadTooLarge":
        return SerialError.PayloadTooLarge();
    }
  }

  // Fallback: wrap as IoError
  const message =
    typeof e === "string"
      ? e
      : e instanceof Error
        ? e.message
        : "unknown error";
  return SerialError.IoError({ message });
};
