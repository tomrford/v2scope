import { derived, writable, get } from "svelte/store";
import type {
  ChannelMapResponse,
  DeviceInfo,
  FrameResponse,
  RtBufferResponse,
  RtLabelsResponse,
  SnapshotHeaderResponse,
  StateResponse,
  TimingResponse,
  TriggerResponse,
  VarListResponse,
} from "../protocol";
import type { RuntimeDeviceError, RuntimeEvent } from "../runtime/RuntimeService";

export type RuntimeTransportError = Extract<RuntimeDeviceError, { type: "device" }>;

export type DeviceConnectionStatus = "connected" | "disconnected";

export type DeviceSyncStatus = "idle" | "loading" | "ready" | "error";

export type LabelList = {
  totalCount: number;
  entries: Array<string | null>;
};

export type DeviceCatalog = {
  varList: LabelList | null;
  rtLabels: LabelList | null;
};

export type DeviceSyncState = {
  info: DeviceSyncStatus;
  state: DeviceSyncStatus;
  timing: DeviceSyncStatus;
  trigger: DeviceSyncStatus;
  channelMap: DeviceSyncStatus;
  frame: DeviceSyncStatus;
  varList: DeviceSyncStatus;
  rtLabels: DeviceSyncStatus;
  rtBuffers: DeviceSyncStatus;
  snapshotHeader: DeviceSyncStatus;
};

export type DeviceUpdateTimestamps = {
  info?: number;
  state?: number;
  timing?: number;
  trigger?: number;
  channelMap?: number;
  frame?: number;
  varList?: number;
  rtLabels?: number;
  rtBuffers?: Map<number, number>;
  snapshotHeader?: number;
};

export type DeviceSnapshot = {
  path: string;
  status: DeviceConnectionStatus;
  deviceError: RuntimeTransportError | null;
  info: DeviceInfo | null;
  state: StateResponse | null;
  timing: TimingResponse | null;
  trigger: TriggerResponse | null;
  channelMap: ChannelMapResponse | null;
  frame: FrameResponse | null;
  rtBuffers: Map<number, RtBufferResponse>;
  snapshotHeader: SnapshotHeaderResponse | null;
  catalog: DeviceCatalog;
  sync: DeviceSyncState;
  updatedAt: DeviceUpdateTimestamps;
  lastSeen: number | null;
};

const emptyCatalog = (): DeviceCatalog => ({
  varList: null,
  rtLabels: null,
});

const emptySync = (): DeviceSyncState => ({
  info: "idle",
  state: "idle",
  timing: "idle",
  trigger: "idle",
  channelMap: "idle",
  frame: "idle",
  varList: "idle",
  rtLabels: "idle",
  rtBuffers: "idle",
  snapshotHeader: "idle",
});

const emptyDevice = (path: string): DeviceSnapshot => ({
  path,
  status: "disconnected",
  deviceError: null,
  info: null,
  state: null,
  timing: null,
  trigger: null,
  channelMap: null,
  frame: null,
  rtBuffers: new Map(),
  snapshotHeader: null,
  catalog: emptyCatalog(),
  sync: emptySync(),
  updatedAt: {},
  lastSeen: null,
});

export const deviceStore = writable<Map<string, DeviceSnapshot>>(new Map());

export function resetDeviceStore(): void {
  deviceStore.set(new Map());
}

const updateDevice = (
  path: string,
  updater: (current: DeviceSnapshot) => DeviceSnapshot,
): void => {
  deviceStore.update((devices) => {
    const next = new Map(devices);
    const current = next.get(path) ?? emptyDevice(path);
    next.set(path, updater(current));
    return next;
  });
};

const markSeen = (device: DeviceSnapshot, now: number): DeviceSnapshot => ({
  ...device,
  lastSeen: now,
});

export function applyDeviceEvent(event: RuntimeEvent): void {
  const now = Date.now();

  switch (event.type) {
    case "deviceConnected": {
      updateDevice(event.device.path, (device) =>
        markSeen(
          {
            ...device,
            status: "connected",
            deviceError: null,
            info: event.device.info,
            state: null,
            timing: null,
            trigger: null,
            channelMap: null,
            frame: null,
            rtBuffers: new Map(),
            snapshotHeader: null,
            sync: {
              ...emptySync(),
              info: "ready",
            },
            updatedAt: { info: now },
          },
          now,
        ),
      );
      return;
    }
    case "deviceDisconnected": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            status: "disconnected",
            deviceError: null,
            state: null,
            timing: null,
            trigger: null,
            channelMap: null,
            frame: null,
            rtBuffers: new Map(),
            snapshotHeader: null,
            catalog: emptyCatalog(),
            sync: {
              ...device.sync,
              state: "idle",
              timing: "idle",
              trigger: "idle",
              channelMap: "idle",
              frame: "idle",
              varList: "idle",
              rtLabels: "idle",
              rtBuffers: "idle",
              snapshotHeader: "idle",
            },
          },
          now,
        ),
      );
      return;
    }
    case "deviceError": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: event.error,
          },
          now,
        ),
      );
      return;
    }
    case "stateUpdated": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: null,
            state: event.state,
            sync: { ...device.sync, state: "ready" },
            updatedAt: { ...device.updatedAt, state: now },
          },
          now,
        ),
      );
      return;
    }
    case "frameUpdated": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: null,
            frame: event.frame,
            sync: { ...device.sync, frame: "ready" },
            updatedAt: { ...device.updatedAt, frame: now },
          },
          now,
        ),
      );
      return;
    }
    case "frameCleared": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            frame: null,
            sync: { ...device.sync, frame: "idle" },
          },
          now,
        ),
      );
      return;
    }
    case "timingUpdated": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: null,
            timing: event.timing,
            sync: { ...device.sync, timing: "ready" },
            updatedAt: { ...device.updatedAt, timing: now },
          },
          now,
        ),
      );
      return;
    }
    case "channelMapUpdated": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: null,
            channelMap: event.map,
            sync: { ...device.sync, channelMap: "ready" },
            updatedAt: { ...device.updatedAt, channelMap: now },
          },
          now,
        ),
      );
      return;
    }
    case "triggerUpdated": {
      updateDevice(event.path, (device) =>
        markSeen(
          {
            ...device,
            deviceError: null,
            trigger: event.trigger,
            sync: { ...device.sync, trigger: "ready" },
            updatedAt: { ...device.updatedAt, trigger: now },
          },
          now,
        ),
      );
      return;
    }
    case "rtBufferUpdated": {
      updateDevice(event.path, (device) => {
        const nextBuffers = new Map(device.rtBuffers);
        nextBuffers.set(event.index, event.rt);
        const nextRtTimes = device.updatedAt.rtBuffers
          ? new Map(device.updatedAt.rtBuffers)
          : new Map();
        nextRtTimes.set(event.index, now);

        return markSeen(
          {
            ...device,
            deviceError: null,
            rtBuffers: nextBuffers,
            sync: { ...device.sync, rtBuffers: "ready" },
            updatedAt: { ...device.updatedAt, rtBuffers: nextRtTimes },
          },
          now,
        );
      });
      return;
    }
    case "frameTick": {
      return;
    }
    case "varListUpdated": {
      // Handled separately in runtime.ts via applyVarList
      return;
    }
    case "rtLabelsUpdated": {
      // Handled separately in runtime.ts via applyRtLabels
      return;
    }
  }
}

type LabelPage = { totalCount: number; startIdx: number; entries: string[] };

const toLabelPage = (
  response: RtLabelsResponse | VarListResponse,
): LabelPage => ({
  totalCount: response.totalCount,
  startIdx: response.startIdx,
  entries: response.entries,
});

const applyLabelPage = (
  current: LabelList | null,
  page: LabelPage,
): LabelList => {
  const total = Math.max(0, Math.floor(page.totalCount));
  const nextEntries =
    current && current.totalCount === total
      ? [...current.entries]
      : Array.from({ length: total }, () => null);

  for (let i = 0; i < page.entries.length; i += 1) {
    const index = page.startIdx + i;
    if (index < 0 || index >= total) continue;
    nextEntries[index] = page.entries[i] ?? null;
  }

  return { totalCount: total, entries: nextEntries };
};

export function applyVarList(path: string, response: VarListResponse): void {
  const now = Date.now();
  const page = toLabelPage(response);
  updateDevice(path, (device) =>
    markSeen(
      {
        ...device,
        deviceError: null,
        catalog: {
          ...device.catalog,
          varList: applyLabelPage(device.catalog.varList, page),
        },
        sync: { ...device.sync, varList: "ready" },
        updatedAt: { ...device.updatedAt, varList: now },
      },
      now,
    ),
  );
}

export function applyRtLabels(path: string, response: RtLabelsResponse): void {
  const now = Date.now();
  const page = toLabelPage(response);
  updateDevice(path, (device) =>
    markSeen(
      {
        ...device,
        deviceError: null,
        catalog: {
          ...device.catalog,
          rtLabels: applyLabelPage(device.catalog.rtLabels, page),
        },
        sync: { ...device.sync, rtLabels: "ready" },
        updatedAt: { ...device.updatedAt, rtLabels: now },
      },
      now,
    ),
  );
}

export function clearDeviceCatalog(path: string): void {
  updateDevice(path, (device) => ({
    ...device,
    catalog: emptyCatalog(),
  }));
}

export function getDeviceSnapshot(path: string): DeviceSnapshot | undefined {
  return get(deviceStore).get(path);
}

export const deviceList = derived(deviceStore, (devices) =>
  Array.from(devices.values()),
);

export const connectedDevices = derived(deviceList, (devices) =>
  devices.filter((device) => device.status === "connected"),
);

export const deviceCatalogs = derived(deviceStore, (devices) => {
  const next = new Map<string, DeviceCatalog>();
  for (const [path, device] of devices) {
    next.set(path, device.catalog);
  }
  return next;
});
