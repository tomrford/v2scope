import { Effect } from "effect";
import { writable } from "svelte/store";
import type {
  RuntimeCommand,
  RuntimeEvent,
} from "../runtime/RuntimeService";
import type { DeviceManager } from "../runtime/DeviceManager";
import type { DeviceService } from "../runtime/DeviceService";
import { RuntimeService } from "../runtime/RuntimeService";
import {
  applyDeviceEvent,
  applyRtLabels,
  applyVarList,
  resetDeviceStore,
} from "./device-store";
import {
  appendRuntimeLog,
  clearRuntimeLogs,
} from "./runtime-logs";

type RuntimeInstance = {
  runPromise: <A, E>(
    effect: Effect.Effect<A, E, DeviceService | DeviceManager | RuntimeService>,
  ) => Promise<A>;
  disposeEffect: Effect.Effect<void, never>;
};

let frameTickSeq = 0;
export const frameTick = writable(0);

const applyEvent = (event: RuntimeEvent): void => {
  applyDeviceEvent(event);
  switch (event.type) {
    case "frameTick": {
      frameTickSeq += 1;
      frameTick.set(frameTickSeq);
      return;
    }
    case "varListUpdated": {
      applyVarList(event.path, event.response);
      return;
    }
    case "rtLabelsUpdated": {
      applyRtLabels(event.path, event.response);
      return;
    }
    case "runtimeLog": {
      appendRuntimeLog({ at: event.at, message: event.message });
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

export async function startRuntimeStores(
  runtimeInstance: RuntimeInstance,
): Promise<void> {
  if (runtime) {
    await stopRuntimeStores();
  }

  resetDeviceStore();
  clearRuntimeLogs();
  runtime = runtimeInstance;

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
  resetDeviceStore();
  clearRuntimeLogs();
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
