import { Effect, Exit, ManagedRuntime } from "effect";
import { ServicesLive } from "./services";

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
  effect: Effect.Effect<A, E>
): Promise<Exit.Exit<A, E>> => Runtime.runPromiseExit(effect);

/**
 * Dispose the runtime (cleanup on app shutdown).
 */
export const disposeRuntime = (): Promise<void> =>
  Effect.runPromise(Runtime.disposeEffect);
