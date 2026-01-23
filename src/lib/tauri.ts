import { Effect } from "effect";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { parseSerialError, type SerialError } from "./errors";
import type { PortFilter, PortInfo, SerialConfig } from "./types";

const invoke = <A>(
  cmd: string,
  args: Record<string, unknown>
): Effect.Effect<A, SerialError> =>
  Effect.tryPromise({
    try: () => tauriInvoke<A>(cmd, args),
    catch: parseSerialError,
  });

export const listPorts = (
  filter?: PortFilter
): Effect.Effect<PortInfo[], SerialError> =>
  invoke<PortInfo[]>("list_ports", { filters: filter });

export const openDevice = (
  path: string,
  config: SerialConfig
): Effect.Effect<number, SerialError> =>
  invoke<number>("open_device", { path, config });

export const closeDevice = (
  handleId: number
): Effect.Effect<void, SerialError> =>
  invoke<void>("close_device", { handleId });

export const flushDevice = (
  handleId: number
): Effect.Effect<void, SerialError> =>
  invoke<void>("flush_device", { handleId });

export const sendRequest = (
  handleId: number,
  payload: Uint8Array
): Effect.Effect<Uint8Array, SerialError> =>
  invoke<number[]>("send_request", {
    handleId,
    payload: Array.from(payload),
  }).pipe(Effect.map((arr) => new Uint8Array(arr)));
