import { Layer } from "effect";
import { DeviceService, DeviceServiceLive } from "./DeviceService";
import { DeviceManager, DeviceManagerLive } from "./DeviceManager";

// Re-exports
export { DeviceHandle } from "./DeviceHandle";
export { DeviceService, DeviceServiceLive } from "./DeviceService";
export {
  DeviceManager,
  DeviceManagerLive,
  type ConnectedDevice,
} from "./DeviceManager";

/**
 * DeviceManager layer with DeviceService dependency wired in.
 */
export const DeviceManagerWithDeps = DeviceManagerLive.pipe(
  Layer.provide(DeviceServiceLive)
);

/**
 * Full services layer - both DeviceService and DeviceManager available.
 */
export const ServicesLive = Layer.merge(
  DeviceServiceLive,
  DeviceManagerWithDeps
);
