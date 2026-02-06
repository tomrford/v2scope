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
  RtLabelsResponse,
  StateResponse,
  TimingResponse,
  TriggerResponse,
  VarListResponse,
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
  | {
      readonly type: "setState";
      readonly state: State;
      readonly targets?: readonly string[];
    }
  | {
      readonly type: "trigger";
      readonly targets?: readonly string[];
    }
  | {
      readonly type: "setTiming";
      readonly divider: number;
      readonly preTrig: number;
      readonly targets?: readonly string[];
    }
  | {
      readonly type: "setChannelMap";
      readonly channelIdx: number;
      readonly catalogIdx: number;
      readonly targets?: readonly string[];
    }
  | {
      readonly type: "setTrigger";
      readonly threshold: number;
      readonly channel: number;
      readonly mode: TriggerMode;
      readonly targets?: readonly string[];
    }
  | {
      readonly type: "setRtBuffer";
      readonly index: number;
      readonly value: number;
      readonly targets?: readonly string[];
    };

export type RuntimeDeviceError =
  | { readonly type: "device"; readonly error: DeviceError };

export type RuntimeEvent =
  | { readonly type: "deviceConnected"; readonly device: ConnectedDevice }
  | { readonly type: "deviceDisconnected"; readonly path: string }
  | { readonly type: "frameTick"; readonly queuedAt: number }
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
      readonly type: "varListUpdated";
      readonly path: string;
      readonly response: VarListResponse;
    }
  | {
      readonly type: "triggerUpdated";
      readonly path: string;
      readonly trigger: TriggerResponse;
    }
  | {
      readonly type: "rtLabelsUpdated";
      readonly path: string;
      readonly response: RtLabelsResponse;
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
      const userQueueSize = 64;
      const userCommands = yield* Queue.bounded<RuntimeCommand>(userQueueSize);
      const statePollCommands = yield* Queue.sliding<RuntimeCommand>(1);
      const framePollCommands = yield* Queue.sliding<RuntimeCommand>(1);
      const events = yield* Queue.unbounded<RuntimeEvent>();
      const pollTurn = yield* Ref.make<"state" | "frame">("state");

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
        run: (device: ConnectedDevice) => Effect.Effect<T, DeviceError>,
        retryCount: number,
        dropRetryableErrors: boolean,
        onSuccess: (path: string, value: T) => Effect.Effect<void, never>,
        targets?: readonly string[],
      ): Effect.Effect<void, never> =>
        Effect.gen(function* () {
          const rawList = yield* getSessionList();
          const targetSet =
            targets && targets.length > 0 ? new Set(targets) : null;
          const list = targetSet
            ? rawList.filter((session) => targetSet.has(session.device.path))
            : rawList;
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

          for (const item of successes) {
            yield* clearDeviceError(item.path);
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
          Effect.tap((device) => syncDevice(device)),
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

      const maxNameEntries = (nameLen: number): number =>
        Math.max(1, Math.floor((252 - 3) / Math.max(1, Math.floor(nameLen))));

      const fetchVarList = (device: ConnectedDevice) =>
        Effect.gen(function* () {
          const info = device.info;
          const maxCount = maxNameEntries(info.nameLen);
          let start = 0;
          let total = info.varCount;

          while (start < total) {
            const page = yield* withRetry(
              () => deviceService.getVarList(device.handle, info, start, maxCount),
              commandRetryCount,
            );
            yield* emit({
              type: "varListUpdated",
              path: device.path,
              response: page,
            });

            total = page.totalCount;
            if (page.entries.length === 0) break;
            const nextStart = page.startIdx + page.entries.length;
            if (nextStart <= start) break;
            start = nextStart;
          }
        });

      const fetchRtLabels = (device: ConnectedDevice) =>
        Effect.gen(function* () {
          const info = device.info;
          const maxCount = maxNameEntries(info.nameLen);
          let start = 0;
          let total = info.rtCount;

          while (start < total) {
            const page = yield* withRetry(
              () =>
                deviceService.getRtLabels(device.handle, info, start, maxCount),
              commandRetryCount,
            );
            yield* emit({
              type: "rtLabelsUpdated",
              path: device.path,
              response: page,
            });

            total = page.totalCount;
            if (page.entries.length === 0) break;
            const nextStart = page.startIdx + page.entries.length;
            if (nextStart <= start) break;
            start = nextStart;
          }
        });

      const syncDevice = (device: ConnectedDevice) =>
        Effect.gen(function* () {
          const tryStep = <T>(
            run: () => Effect.Effect<T, DeviceError>,
          ): Effect.Effect<T | null, never> =>
            withRetry(run, commandRetryCount).pipe(
              Effect.catchAll((error) =>
                setDeviceError(device.path, { type: "device", error }).pipe(
                  Effect.as(null),
                ),
              ),
            );

          const state = yield* tryStep(() =>
            deviceService.getState(device.handle),
          );
          if (!state) return;

          yield* emit({ type: "stateUpdated", path: device.path, state });
          const info = device.info;

          if (state.state === State.MISCONFIGURED) {
            yield* fetchVarList(device).pipe(
              Effect.catchAll((error) =>
                setDeviceError(device.path, { type: "device", error }),
              ),
            );
            return;
          }

          const timing = yield* tryStep(() =>
            deviceService.getTiming(device.handle, info),
          );
          if (timing) {
            yield* emit({ type: "timingUpdated", path: device.path, timing });
          }

          const trigger = yield* tryStep(() =>
            deviceService.getTrigger(device.handle, info),
          );
          if (trigger) {
            yield* emit({ type: "triggerUpdated", path: device.path, trigger });
          }

          const map = yield* tryStep(() =>
            deviceService.getChannelMap(device.handle, info),
          );
          if (map) {
            yield* emit({ type: "channelMapUpdated", path: device.path, map });
          }

          yield* fetchVarList(device).pipe(
            Effect.catchAll((error) =>
              setDeviceError(device.path, { type: "device", error }),
            ),
          );

          yield* fetchRtLabels(device).pipe(
            Effect.catchAll((error) =>
              setDeviceError(device.path, { type: "device", error }),
            ),
          );

          for (let index = 0; index < info.rtCount; index += 1) {
            const rt = yield* tryStep(() =>
              deviceService.getRtBuffer(device.handle, info, index),
            );
            if (!rt) continue;
            yield* emit({
              type: "rtBufferUpdated",
              path: device.path,
              index,
              rt,
            });
          }
        }).pipe(
          Effect.catchAll((error) =>
            setDeviceError(device.path, { type: "device", error }),
          ),
          Effect.ignore,
        );

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
              (device) => deviceService.getState(device.handle),
              statePollRetryCount,
              false,
              (path, state) => emit({ type: "stateUpdated", path, state }),
              undefined,
            );
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
              }

              yield* runOnDevices(
                (device) => deviceService.getFrame(device.handle, device.info),
                framePollRetryCount,
                true,
                (path, frame) => emit({ type: "frameUpdated", path, frame }),
                undefined,
              );
            });
          case "setState":
            return runOnDevices(
              (device) =>
                deviceService
                  .setState(device.handle, cmd.state)
                  .pipe(
                    Effect.flatMap(() => deviceService.getState(device.handle)),
                  ),
              commandRetryCount,
              false,
              (path, state) => emit({ type: "stateUpdated", path, state }),
              cmd.targets,
            );
          case "trigger":
            return runOnDevices(
              (device) => deviceService.trigger(device.handle),
              commandRetryCount,
              false,
              () => Effect.succeed(undefined),
              cmd.targets,
            );
          case "setTiming":
            return runOnDevices(
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
              commandRetryCount,
              false,
              (path, timing) => emit({ type: "timingUpdated", path, timing }),
              cmd.targets,
            );
          case "setChannelMap":
            return runOnDevices(
              (device) =>
                deviceService
                  .setChannelMap(device.handle, cmd.channelIdx, cmd.catalogIdx)
                  .pipe(
                    Effect.flatMap(() =>
                      deviceService.getChannelMap(device.handle, device.info),
                    ),
                  ),
              commandRetryCount,
              false,
              (path, map) => emit({ type: "channelMapUpdated", path, map }),
              cmd.targets,
            );
          case "setTrigger":
            return runOnDevices(
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
              commandRetryCount,
              false,
              (path, trigger) =>
                emit({ type: "triggerUpdated", path, trigger }),
              cmd.targets,
            );
          case "setRtBuffer":
            return runOnDevices(
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
              commandRetryCount,
              false,
              (path, rt) =>
                emit({ type: "rtBufferUpdated", path, index: cmd.index, rt }),
              cmd.targets,
            );
        }
      };

      const takePollImmediate = Effect.gen(function* () {
        const turn = yield* Ref.get(pollTurn);
        const first = turn === "state" ? statePollCommands : framePollCommands;
        const second = turn === "state" ? framePollCommands : statePollCommands;

        const firstResult = yield* Queue.poll(first);
        if (Option.isSome(firstResult)) {
          yield* Ref.set(pollTurn, turn === "state" ? "frame" : "state");
          return firstResult.value;
        }

        const secondResult = yield* Queue.poll(second);
        if (Option.isSome(secondResult)) {
          yield* Ref.set(pollTurn, turn);
          return secondResult.value;
        }

        return null;
      });

      const waitForPoll = Effect.race(
        Queue.take(statePollCommands).pipe(
          Effect.map((cmd) => ({ cmd, next: "frame" as const })),
        ),
        Queue.take(framePollCommands).pipe(
          Effect.map((cmd) => ({ cmd, next: "state" as const })),
        ),
      ).pipe(
        Effect.tap((result) => Ref.set(pollTurn, result.next)),
        Effect.map((result) => result.cmd),
      );

      const takeCommand = Effect.gen(function* () {
        const user = yield* Queue.poll(userCommands);
        if (Option.isSome(user)) return user.value;

        const pollImmediate = yield* takePollImmediate;
        if (pollImmediate) return pollImmediate;

        return yield* Effect.race(Queue.take(userCommands), waitForPoll);
      });

      const commandWorker = Effect.forever(
        takeCommand.pipe(Effect.flatMap(handleCommand)),
      );

      const stateIntervalMs = Math.max(1, Math.floor(1000 / config.stateHz));
      const frameIntervalMs = Math.max(1, Math.floor(1000 / config.frameHz));

      const statePoller = Effect.repeat(
        Effect.gen(function* () {
          yield* Queue.offer(statePollCommands, {
            type: "pollState",
            queuedAt: Date.now(),
          });
        }).pipe(Effect.ignore),
        Schedule.spaced(Duration.millis(stateIntervalMs)),
      );

      const framePoller = Effect.repeat(
        Effect.gen(function* () {
          yield* emit({ type: "frameTick", queuedAt: Date.now() });
          yield* Queue.offer(framePollCommands, {
            type: "pollFrame",
            queuedAt: Date.now(),
          });
        }).pipe(Effect.ignore),
        Schedule.spaced(Duration.millis(frameIntervalMs)),
      );

      yield* Effect.forkScoped(commandWorker);
      yield* Effect.forkScoped(statePoller);
      yield* Effect.forkScoped(framePoller);

      const enqueueCommand = (cmd: RuntimeCommand) => {
        switch (cmd.type) {
          case "pollState":
            return Queue.offer(statePollCommands, cmd).pipe(Effect.ignore);
          case "pollFrame":
            return Queue.offer(framePollCommands, cmd).pipe(Effect.ignore);
          default:
            return Queue.offer(userCommands, cmd).pipe(Effect.ignore);
        }
      };

      return {
        enqueue: enqueueCommand,
        takeEvent: () => Queue.take(events),
        getSessions: () => getSessionList(),
      };
    }),
  );
