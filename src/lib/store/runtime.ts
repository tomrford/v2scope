import { Effect } from "effect";
import { derived, writable } from "svelte/store";
import type {
  ChannelMapResponse,
  DeviceInfo,
  FrameResponse,
  RtBufferResponse,
  StateResponse,
  TimingResponse,
  TriggerResponse,
} from "../protocol";
import type {
  RuntimeCommand,
  RuntimeDeviceError,
  RuntimeEvent,
} from "../runtime/RuntimeService";
import type { DeviceManager } from "../runtime/DeviceManager";
import type { DeviceService } from "../runtime/DeviceService";
import { RuntimeService } from "../runtime/RuntimeService";

type RuntimeInstance = {
  runPromise: <A, E>(
    effect: Effect.Effect<A, E, DeviceService | DeviceManager | RuntimeService>,
  ) => Promise<A>;
  disposeEffect: Effect.Effect<void, never>;
};

export type DeviceConnectionStatus = "connected" | "disconnected";

export type DeviceSession = {
  path: string;
  info: DeviceInfo | null;
  status: DeviceConnectionStatus;
  error: RuntimeDeviceError | null;
  state: StateResponse | null;
  frame: FrameResponse | null;
  timing: TimingResponse | null;
  trigger: TriggerResponse | null;
  channelMap: ChannelMapResponse | null;
  rtBuffers: Map<number, RtBufferResponse>;
};

export type DeviceCompatibility = {
  baseline: DeviceInfo | null;
  baselinePath: string | null;
  mismatches: Map<string, string[]>;
  compatiblePaths: string[];
};

const emptySession = (path: string): DeviceSession => ({
  path,
  info: null,
  status: "disconnected",
  error: null,
  state: null,
  frame: null,
  timing: null,
  trigger: null,
  channelMap: null,
  rtBuffers: new Map(),
});

export const deviceSessions = writable<Map<string, DeviceSession>>(new Map());

export const connectedSessions = derived(deviceSessions, (sessions) =>
  Array.from(sessions.values()).filter(
    (session) => session.status === "connected",
  ),
);

let frameTickSeq = 0;
export const frameTick = writable(0);

const compareInfo = (baseline: DeviceInfo, other: DeviceInfo): string[] => {
  const mismatches: string[] = [];
  if (baseline.numChannels !== other.numChannels)
    mismatches.push("numChannels");
  if (baseline.bufferSize !== other.bufferSize) mismatches.push("bufferSize");
  if (baseline.isrKhz !== other.isrKhz) mismatches.push("isrKhz");
  if (baseline.varCount !== other.varCount) mismatches.push("varCount");
  if (baseline.rtCount !== other.rtCount) mismatches.push("rtCount");
  if (baseline.rtBufferLen !== other.rtBufferLen)
    mismatches.push("rtBufferLen");
  if (baseline.nameLen !== other.nameLen) mismatches.push("nameLen");
  if (baseline.endianness !== other.endianness) mismatches.push("endianness");
  return mismatches;
};

export const compatibility = derived(
  deviceSessions,
  (sessions): DeviceCompatibility => {
    const connected = Array.from(sessions.values()).filter(
      (session) => session.status === "connected" && session.info !== null,
    );

    if (connected.length === 0) {
      return {
        baseline: null,
        baselinePath: null,
        mismatches: new Map(),
        compatiblePaths: [],
      };
    }

    const baseline = connected[0].info as DeviceInfo;
    const baselinePath = connected[0].path;
    const mismatches = new Map<string, string[]>();

    for (const session of connected.slice(1)) {
      const info = session.info as DeviceInfo;
      const diff = compareInfo(baseline, info);
      if (diff.length > 0) {
        mismatches.set(session.path, diff);
      }
    }

    const compatiblePaths = connected
      .map((session) => session.path)
      .filter((path) => path === baselinePath || !mismatches.has(path));

    return { baseline, baselinePath, mismatches, compatiblePaths };
  },
);

export const compatibleSessions = derived(
  [deviceSessions, compatibility],
  ([sessions, compat]) =>
    compat.compatiblePaths
      .map((path) => sessions.get(path))
      .filter((session): session is DeviceSession => Boolean(session)),
);

const updateSession = (
  path: string,
  update: (session: DeviceSession) => DeviceSession,
): void => {
  deviceSessions.update((sessions) => {
    const next = new Map(sessions);
    const current = next.get(path) ?? emptySession(path);
    next.set(path, update(current));
    return next;
  });
};

const applyEvent = (event: RuntimeEvent): void => {
  switch (event.type) {
    case "deviceConnected": {
      updateSession(event.device.path, (session) => ({
        ...session,
        info: event.device.info,
        status: "connected",
        error: null,
      }));
      return;
    }
    case "deviceDisconnected": {
      updateSession(event.path, (session) => ({
        ...session,
        status: "disconnected",
        error: null,
        state: null,
        frame: null,
        timing: null,
        trigger: null,
        channelMap: null,
        rtBuffers: new Map(),
      }));
      return;
    }
    case "deviceError": {
      updateSession(event.path, (session) => ({
        ...session,
        error: event.error,
      }));
      return;
    }
    case "stateUpdated": {
      updateSession(event.path, (session) => ({
        ...session,
        state: event.state,
      }));
      return;
    }
    case "frameUpdated": {
      updateSession(event.path, (session) => ({
        ...session,
        frame: event.frame,
      }));
      return;
    }
    case "frameTick": {
      frameTickSeq += 1;
      frameTick.set(frameTickSeq);
      return;
    }
    case "frameCleared": {
      updateSession(event.path, (session) => ({
        ...session,
        frame: null,
      }));
      return;
    }
    case "timingUpdated": {
      updateSession(event.path, (session) => ({
        ...session,
        timing: event.timing,
      }));
      return;
    }
    case "channelMapUpdated": {
      updateSession(event.path, (session) => ({
        ...session,
        channelMap: event.map,
      }));
      return;
    }
    case "triggerUpdated": {
      updateSession(event.path, (session) => ({
        ...session,
        trigger: event.trigger,
      }));
      return;
    }
    case "rtBufferUpdated": {
      updateSession(event.path, (session) => {
        const nextBuffers = new Map(session.rtBuffers);
        nextBuffers.set(event.index, event.rt);
        return { ...session, rtBuffers: nextBuffers };
      });
      return;
    }
  }
};

let runtime: RuntimeInstance | null = null;
let eventLoopPromise: Promise<never> | null = null;

const eventLoop = Effect.flatMap(RuntimeService, (service) =>
  Effect.forever(
    service
      .takeEvent()
      .pipe(Effect.flatMap((event) => Effect.sync(() => applyEvent(event)))),
  ),
);

const bootstrapSessions = Effect.flatMap(RuntimeService, (service) =>
  service.getSessions().pipe(
    Effect.tap((sessions) =>
      Effect.sync(() => {
        const next = new Map<string, DeviceSession>();
        for (const session of sessions) {
          next.set(session.device.path, {
            path: session.device.path,
            info: session.device.info,
            status: "connected",
            error: session.error,
            state: null,
            frame: null,
            timing: null,
            trigger: null,
            channelMap: null,
            rtBuffers: new Map(),
          });
        }
        deviceSessions.set(next);
      }),
    ),
  ),
);

export async function startRuntimeStores(
  runtimeInstance: RuntimeInstance,
): Promise<void> {
  if (runtime) {
    await stopRuntimeStores();
  }

  deviceSessions.set(new Map());
  runtime = runtimeInstance;

  await runtime.runPromise(bootstrapSessions);

  eventLoopPromise = runtime.runPromise(eventLoop);
  eventLoopPromise.catch((error) => {
    console.error("runtime event loop failed", error);
  });
}

export async function stopRuntimeStores(): Promise<void> {
  if (!runtime) return;
  await Effect.runPromise(runtime.disposeEffect);
  runtime = null;
  eventLoopPromise = null;
}

export async function runRuntimeEffect<A, E>(
  effect: Effect.Effect<A, E, DeviceService | DeviceManager | RuntimeService>,
): Promise<A> {
  if (!runtime) {
    throw new Error("runtime not started");
  }

  return runtime.runPromise(effect);
}

export async function enqueueRuntimeCommand(
  command: RuntimeCommand,
): Promise<void> {
  if (!runtime) {
    throw new Error("runtime not started");
  }

  await runtime.runPromise(
    Effect.flatMap(RuntimeService, (service) => service.enqueue(command)),
  );
}
