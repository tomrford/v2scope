import { Context, Effect, HashMap, Layer, Option, Ref } from "effect";
import type { DeviceInfo } from "../protocol";
import type { SerialConfig } from "../transport/serial.schema";
import type { DeviceError } from "../errors";
import { DeviceHandle } from "./DeviceHandle";
import { DeviceService } from "./DeviceService";

/**
 * Connected device with cached DeviceInfo.
 */
export interface ConnectedDevice {
  readonly path: string;
  readonly handle: DeviceHandle;
  readonly info: DeviceInfo;
}

/**
 * DeviceManager shape - device lifecycle tracking.
 */
export interface DeviceManagerShape {
  readonly connect: (
    path: string,
    config: SerialConfig,
  ) => Effect.Effect<ConnectedDevice, DeviceError>;
  readonly disconnect: (path: string) => Effect.Effect<void, never>;
  readonly getActiveDevices: () => Effect.Effect<
    readonly ConnectedDevice[],
    never
  >;
  readonly getDevice: (
    path: string,
  ) => Effect.Effect<ConnectedDevice | null, never>;
}

/**
 * DeviceManager tag for dependency injection.
 */
export class DeviceManager extends Context.Tag("DeviceManager")<
  DeviceManager,
  DeviceManagerShape
>() {}

/**
 * Live implementation of DeviceManager.
 * Uses Ref<HashMap> for internal state tracking.
 */
export const DeviceManagerLive = Layer.effect(
  DeviceManager,
  Effect.gen(function* () {
    const deviceService = yield* DeviceService;
    const devices = yield* Ref.make(HashMap.empty<string, ConnectedDevice>());

    return {
      connect: (path, config) =>
        Effect.gen(function* () {
          // Check if already connected
          const current = yield* Ref.get(devices);
          const existing = HashMap.get(current, path);
          if (Option.isSome(existing)) {
            return existing.value;
          }

          // Open device and get info
          const handle = yield* deviceService.openDevice(path, config);
          const info = yield* deviceService.getInfo(handle);
          const device: ConnectedDevice = { path, handle, info };

          // Store in map
          yield* Ref.update(devices, HashMap.set(path, device));
          return device;
        }),

      disconnect: (path) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(devices);
          const existing = HashMap.get(current, path);

          if (Option.isSome(existing)) {
            // Close device (ignore errors - best effort)
            yield* deviceService
              .closeDevice(existing.value.handle)
              .pipe(Effect.ignore);
            // Remove from map
            yield* Ref.update(devices, HashMap.remove(path));
          }
        }),

      getActiveDevices: () =>
        Ref.get(devices).pipe(Effect.map((m) => Array.from(HashMap.values(m)))),

      getDevice: (path) =>
        Ref.get(devices).pipe(
          Effect.map((m) => {
            const result = HashMap.get(m, path);
            return Option.isSome(result) ? result.value : null;
          }),
        ),
    };
  }),
);
