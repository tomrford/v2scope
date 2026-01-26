import {
  Context,
  Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
} from "effect";
import type { DeviceError } from "../errors";
import type {
  ChannelMapResponse,
  FrameResponse,
  RtBufferResponse,
  StateResponse,
  TimingResponse,
  TriggerResponse,
} from "../protocol";
import { State, TriggerMode } from "../protocol";
import type { SerialConfig } from "../transport/serial.schema";
import type { ConnectedDevice } from "./DeviceManager";
import { DeviceManager } from "./DeviceManager";
import { DeviceService } from "./DeviceService";

export interface PollingConfig {
  readonly stateHz: number;
  readonly frameHz: number;
  readonly frameTimeoutMs: number;
  readonly crcRetryAttempts: number;
}

export type RuntimeCommand =
  | {
      readonly type: "connect";
      readonly path: string;
      readonly config: SerialConfig;
    }
  | { readonly type: "disconnect"; readonly path: string }
  | { readonly type: "pollState"; readonly queuedAt: number }
  | { readonly type: "pollFrame"; readonly queuedAt: number }
  | { readonly type: "setState"; readonly state: State }
  | { readonly type: "trigger" }
  | {
      readonly type: "setTiming";
      readonly divider: number;
      readonly preTrig: number;
    }
  | {
      readonly type: "setChannelMap";
      readonly channelIdx: number;
      readonly catalogIdx: number;
    }
  | {
      readonly type: "setTrigger";
      readonly threshold: number;
      readonly channel: number;
      readonly mode: TriggerMode;
    }
  | {
      readonly type: "setRtBuffer";
      readonly index: number;
      readonly value: number;
    };

export type RuntimeDeviceError =
  | { readonly type: "device"; readonly error: DeviceError }
  | { readonly type: "mismatch"; readonly message: string };

export type RuntimeEvent =
  | { readonly type: "deviceConnected"; readonly device: ConnectedDevice }
  | { readonly type: "deviceDisconnected"; readonly path: string }
  | {
      readonly type: "deviceError";
      readonly path: string;
      readonly error: RuntimeDeviceError;
    }
  | {
      readonly type: "stateUpdated";
      readonly path: string;
      readonly state: StateResponse;
    }
  | {
      readonly type: "frameUpdated";
      readonly path: string;
      readonly frame: FrameResponse;
    }
  | {
      readonly type: "frameCleared";
      readonly path: string;
    }
  | {
      readonly type: "timingUpdated";
      readonly path: string;
      readonly timing: TimingResponse;
    }
  | {
      readonly type: "channelMapUpdated";
      readonly path: string;
      readonly map: ChannelMapResponse;
    }
  | {
      readonly type: "triggerUpdated";
      readonly path: string;
      readonly trigger: TriggerResponse;
    }
  | {
      readonly type: "rtBufferUpdated";
      readonly path: string;
      readonly index: number;
      readonly rt: RtBufferResponse;
    };

interface DeviceSession {
  readonly device: ConnectedDevice;
  readonly error: RuntimeDeviceError | null;
}

export interface RuntimeServiceShape {
  readonly enqueue: (cmd: RuntimeCommand) => Effect.Effect<void, never>;
  readonly takeEvent: () => Effect.Effect<RuntimeEvent, never>;
  readonly getSessions: () => Effect.Effect<readonly DeviceSession[], never>;
}

export class RuntimeService extends Context.Tag("RuntimeService")<
  RuntimeService,
  RuntimeServiceShape
>() {}

const isEqual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const errorTag = (error: DeviceError): string | null => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = (error as { _tag?: string })._tag;
    return typeof tag === "string" ? tag : null;
  }
  return null;
};

const isRetryableError = (error: DeviceError): boolean =>
  errorTag(error) === "CrcMismatch";

const withRetry = <T>(
  run: () => Effect.Effect<T, DeviceError>,
  retriesLeft: number,
): Effect.Effect<T, DeviceError> =>
  run().pipe(
    Effect.catchAll((error) =>
      retriesLeft > 0 && isRetryableError(error)
        ? withRetry(run, retriesLeft - 1)
        : Effect.fail(error),
    ),
  );

export const RuntimeServiceLive = (config: PollingConfig) =>
  Layer.scoped(
    RuntimeService,
    Effect.gen(function* () {
      const deviceManager = yield* DeviceManager;
      const deviceService = yield* DeviceService;
      const sessions = yield* Ref.make(HashMap.empty<string, DeviceSession>());
      const commandQueueSize = 64;
      const commands = yield* Queue.sliding<RuntimeCommand>(commandQueueSize);
      const events = yield* Queue.unbounded<RuntimeEvent>();
      const statePollPending = yield* Ref.make(false);
      const framePollPending = yield* Ref.make(false);

      const emit = (event: RuntimeEvent) =>
        Queue.offer(events, event).pipe(Effect.ignore);

      const getSessionList = () =>
        Ref.get(sessions).pipe(
          Effect.map((m) => Array.from(HashMap.values(m))),
        );

      const updateSession = (
        path: string,
        f: (session: DeviceSession) => DeviceSession,
      ) =>
        Ref.update(sessions, (m) => {
          const existing = HashMap.get(m, path);
          if (Option.isNone(existing)) return m;
          return HashMap.set(m, path, f(existing.value));
        });

      const setDeviceError = (path: string, error: RuntimeDeviceError) =>
        updateSession(path, (session) => ({ ...session, error })).pipe(
          Effect.tap(() => emit({ type: "deviceError", path, error })),
          Effect.ignore,
        );

      const clearDeviceError = (path: string) =>
        updateSession(path, (session) => ({ ...session, error: null }));

      const runOnDevices = <T>(
        label: string,
        run: (device: ConnectedDevice) => Effect.Effect<T, DeviceError>,
        compare: boolean,
        retryCount: number,
        dropRetryableErrors: boolean,
        onSuccess: (path: string, value: T) => Effect.Effect<void, never>,
      ): Effect.Effect<void, never> =>
        Effect.gen(function* () {
          const list = yield* getSessionList();
          if (list.length === 0) return;

          const results = yield* Effect.forEach(
            list,
            (session) =>
              withRetry(() => run(session.device), retryCount).pipe(
                Effect.map((value) => ({
                  path: session.device.path,
                  value,
                })),
                Effect.catchAll((error) =>
                  Effect.succeed({ path: session.device.path, error }),
                ),
              ),
            { concurrency: "unbounded" },
          );

          const successes = results.filter(
            (r): r is { readonly path: string; readonly value: T } =>
              "value" in r,
          );

          const mismatched = new Set<string>();
          if (compare && successes.length > 1) {
            const baseline = successes[0].value;
            for (const item of successes.slice(1)) {
              if (!isEqual(baseline, item.value)) {
                mismatched.add(item.path);
              }
            }
          }

          for (const item of successes) {
            if (mismatched.has(item.path)) {
              yield* setDeviceError(item.path, {
                type: "mismatch",
                message: `${label} mismatch`,
              });
            } else {
              yield* clearDeviceError(item.path);
            }
            yield* onSuccess(item.path, item.value);
          }

          for (const item of results) {
            if ("error" in item) {
              if (dropRetryableErrors && isRetryableError(item.error)) {
                continue;
              }
              yield* setDeviceError(item.path, {
                type: "device",
                error: item.error,
              });
            }
          }
        });

      const connectDevice = (path: string, config: SerialConfig) =>
        deviceManager.connect(path, config).pipe(
          Effect.tap((device) => {
            const session: DeviceSession = { device, error: null };
            return Ref.update(sessions, HashMap.set(path, session));
          }),
          Effect.tap((device) => emit({ type: "deviceConnected", device })),
          Effect.catchAll((error) =>
            setDeviceError(path, { type: "device", error }),
          ),
          Effect.ignore,
        );

      const disconnectDevice = (path: string) =>
        deviceManager.disconnect(path).pipe(
          Effect.tap(() => Ref.update(sessions, HashMap.remove(path))),
          Effect.tap(() => emit({ type: "deviceDisconnected", path })),
          Effect.ignore,
        );

      const retryAttempts = Math.max(1, Math.floor(config.crcRetryAttempts));
      const retryCount = retryAttempts - 1;
      const commandRetryCount = retryCount;
      const statePollRetryCount = retryCount;
      const framePollRetryCount = 0;
      const frameTimeoutMs = Math.max(1, Math.floor(config.frameTimeoutMs));

      const handleCommand = (
        cmd: RuntimeCommand,
      ): Effect.Effect<void, never> => {
        switch (cmd.type) {
          case "connect":
            return connectDevice(cmd.path, cmd.config);
          case "disconnect":
            return disconnectDevice(cmd.path);
          case "pollState":
            return runOnDevices(
              "state",
              (device) => deviceService.getState(device.handle),
              true,
              statePollRetryCount,
              false,
              (path, state) => emit({ type: "stateUpdated", path, state }),
            ).pipe(Effect.ensuring(Ref.set(statePollPending, false)));
          case "pollFrame":
            return Effect.gen(function* () {
              const delayMs = Date.now() - cmd.queuedAt;
              if (delayMs > frameTimeoutMs) {
                const list = yield* getSessionList();
                for (const session of list) {
                  yield* emit({
                    type: "frameCleared",
                    path: session.device.path,
                  });
                }
                return;
              }

              yield* runOnDevices(
                "frame",
                (device) => deviceService.getFrame(device.handle, device.info),
                false,
                framePollRetryCount,
                true,
                (path, frame) => emit({ type: "frameUpdated", path, frame }),
              );
            }).pipe(Effect.ensuring(Ref.set(framePollPending, false)));
          case "setState":
            return runOnDevices(
              "setState",
              (device) =>
                deviceService
                  .setState(device.handle, cmd.state)
                  .pipe(
                    Effect.flatMap(() => deviceService.getState(device.handle)),
                  ),
              true,
              commandRetryCount,
              false,
              (path, state) => emit({ type: "stateUpdated", path, state }),
            );
          case "trigger":
            return runOnDevices(
              "trigger",
              (device) => deviceService.trigger(device.handle),
              false,
              commandRetryCount,
              false,
              () => Effect.succeed(undefined),
            );
          case "setTiming":
            return runOnDevices(
              "setTiming",
              (device) =>
                deviceService
                  .setTiming(
                    device.handle,
                    device.info,
                    cmd.divider,
                    cmd.preTrig,
                  )
                  .pipe(
                    Effect.flatMap(() =>
                      deviceService.getTiming(device.handle, device.info),
                    ),
                  ),
              true,
              commandRetryCount,
              false,
              (path, timing) => emit({ type: "timingUpdated", path, timing }),
            );
          case "setChannelMap":
            return runOnDevices(
              "setChannelMap",
              (device) =>
                deviceService
                  .setChannelMap(device.handle, cmd.channelIdx, cmd.catalogIdx)
                  .pipe(
                    Effect.flatMap(() =>
                      deviceService.getChannelMap(device.handle, device.info),
                    ),
                  ),
              true,
              commandRetryCount,
              false,
              (path, map) => emit({ type: "channelMapUpdated", path, map }),
            );
          case "setTrigger":
            return runOnDevices(
              "setTrigger",
              (device) =>
                deviceService
                  .setTrigger(
                    device.handle,
                    device.info,
                    cmd.threshold,
                    cmd.channel,
                    cmd.mode,
                  )
                  .pipe(
                    Effect.flatMap(() =>
                      deviceService.getTrigger(device.handle, device.info),
                    ),
                  ),
              true,
              commandRetryCount,
              false,
              (path, trigger) =>
                emit({ type: "triggerUpdated", path, trigger }),
            );
          case "setRtBuffer":
            return runOnDevices(
              "setRtBuffer",
              (device) =>
                deviceService
                  .setRtBuffer(device.handle, device.info, cmd.index, cmd.value)
                  .pipe(
                    Effect.flatMap(() =>
                      deviceService.getRtBuffer(
                        device.handle,
                        device.info,
                        cmd.index,
                      ),
                    ),
                  ),
              false,
              commandRetryCount,
              false,
              (path, rt) =>
                emit({ type: "rtBufferUpdated", path, index: cmd.index, rt }),
            );
        }
      };

      const commandWorker = Effect.forever(
        Queue.take(commands).pipe(Effect.flatMap(handleCommand)),
      );

      const stateIntervalMs = Math.max(1, Math.floor(1000 / config.stateHz));
      const frameIntervalMs = Math.max(1, Math.floor(1000 / config.frameHz));

      const statePoller = Effect.repeat(
        Effect.gen(function* () {
          const pending = yield* Ref.get(statePollPending);
          if (pending) return;
          yield* Ref.set(statePollPending, true);
          yield* Queue.offer(commands, {
            type: "pollState",
            queuedAt: Date.now(),
          });
        }).pipe(Effect.ignore),
        Schedule.spaced(Duration.millis(stateIntervalMs)),
      );

      const framePoller = Effect.repeat(
        Effect.gen(function* () {
          const pending = yield* Ref.get(framePollPending);
          if (pending) return;
          yield* Ref.set(framePollPending, true);
          yield* Queue.offer(commands, {
            type: "pollFrame",
            queuedAt: Date.now(),
          });
        }).pipe(Effect.ignore),
        Schedule.spaced(Duration.millis(frameIntervalMs)),
      );

      yield* Effect.forkScoped(commandWorker);
      yield* Effect.forkScoped(statePoller);
      yield* Effect.forkScoped(framePoller);

      return {
        enqueue: (cmd) => Queue.offer(commands, cmd).pipe(Effect.ignore),
        takeEvent: () => Queue.take(events),
        getSessions: () => getSessionList(),
      };
    }),
  );
