import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { DeviceServiceLive } from "./DeviceService";
import { DeviceManagerLive } from "./DeviceManager";

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
  Layer.provide(DeviceServiceLive),
);

/**
 * Full services layer - both DeviceService and DeviceManager available.
 */
export const ServicesLive = Layer.merge(
  DeviceServiceLive,
  DeviceManagerWithDeps,
);

/**
 * Application runtime with all services.
 */
export const Runtime = ManagedRuntime.make(ServicesLive);

/**
 * Run an effect with the application runtime.
 */
export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Runtime.runPromise(effect);

/**
 * Run an effect and return Exit (success or failure).
 */
export const runEffectExit = <A, E>(
  effect: Effect.Effect<A, E>,
): Promise<Exit.Exit<A, E>> => Runtime.runPromiseExit(effect);

/**
 * Dispose the runtime (cleanup on app shutdown).
 */
export const disposeRuntime = (): Promise<void> =>
  Effect.runPromise(Runtime.disposeEffect);
