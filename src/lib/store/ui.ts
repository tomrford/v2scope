import { derived, writable } from "svelte/store";
import type {
  ChannelLabelsResponse,
  ChannelMapResponse,
  DeviceInfo,
  RtLabelsResponse,
  StateResponse,
  TimingResponse,
  TriggerResponse,
  VarListResponse,
} from "../protocol";
import {
  compatibility,
  compatibleSessions,
  deviceSessions,
  type DeviceSession,
} from "./runtime";

type LabelList = {
  totalCount: number;
  entries: Array<string | null>;
};

export type DeviceCatalog = {
  varList: LabelList | null;
  channelLabels: LabelList | null;
  rtLabels: LabelList | null;
};

export type UiDeviceSession = DeviceSession & {
  catalog: DeviceCatalog | null;
};

export type UiConsensus = {
  baselinePath: string | null;
  baselineInfo: DeviceInfo | null;
  compatiblePaths: string[];
  mismatches: Map<string, string[]>;
  state: StateResponse | null;
  timing: TimingResponse | null;
  trigger: TriggerResponse | null;
  channelMap: ChannelMapResponse | null;
  channelLabels: Array<string | null>;
  rtLabels: Array<string | null>;
  varList: Array<string | null>;
  visibleChannels: number[];
  visibleRtBuffers: number[];
};

const emptyCatalog = (): DeviceCatalog => ({
  varList: null,
  channelLabels: null,
  rtLabels: null,
});

export const deviceCatalogs = writable<Map<string, DeviceCatalog>>(new Map());

const toLabelPage = (
  response: ChannelLabelsResponse | RtLabelsResponse | VarListResponse,
): { totalCount: number; startIdx: number; entries: string[] } => {
  if ("labels" in response) {
    return {
      totalCount: response.totalCount,
      startIdx: response.startIdx,
      entries: response.labels,
    };
  }
  return {
    totalCount: response.totalCount,
    startIdx: response.startIdx,
    entries: response.entries,
  };
};

const applyLabelPage = (
  current: LabelList | null,
  page: { totalCount: number; startIdx: number; entries: string[] },
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

const updateCatalog = (
  path: string,
  updater: (current: DeviceCatalog) => DeviceCatalog,
): void => {
  deviceCatalogs.update((catalogs) => {
    const next = new Map(catalogs);
    const current = next.get(path) ?? emptyCatalog();
    next.set(path, updater(current));
    return next;
  });
};

export function applyVarList(path: string, response: VarListResponse): void {
  const page = toLabelPage(response);
  updateCatalog(path, (catalog) => ({
    ...catalog,
    varList: applyLabelPage(catalog.varList, page),
  }));
}

export function applyChannelLabels(
  path: string,
  response: ChannelLabelsResponse,
): void {
  const page = toLabelPage(response);
  updateCatalog(path, (catalog) => ({
    ...catalog,
    channelLabels: applyLabelPage(catalog.channelLabels, page),
  }));
}

export function applyRtLabels(path: string, response: RtLabelsResponse): void {
  const page = toLabelPage(response);
  updateCatalog(path, (catalog) => ({
    ...catalog,
    rtLabels: applyLabelPage(catalog.rtLabels, page),
  }));
}

export function clearDeviceCatalog(path: string): void {
  deviceCatalogs.update((catalogs) => {
    if (!catalogs.has(path)) return catalogs;
    const next = new Map(catalogs);
    next.delete(path);
    return next;
  });
}

export function clearAllCatalogs(): void {
  deviceCatalogs.set(new Map());
}

export const uiDevices = derived(
  [deviceSessions, deviceCatalogs],
  ([sessions, catalogs]) => {
    const next = new Map<string, UiDeviceSession>();
    for (const [path, session] of sessions) {
      next.set(path, {
        ...session,
        catalog: catalogs.get(path) ?? null,
      });
    }
    return next;
  },
);

const allPresent = <T>(values: Array<T | null>): values is T[] =>
  values.every((value): value is T => value !== null);

const arrayEqual = (a: readonly number[], b: readonly number[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const allEqual = <T>(
  values: T[],
  equals: (left: T, right: T) => boolean,
): T | null => {
  if (values.length === 0) return null;
  const baseline = values[0];
  for (const value of values.slice(1)) {
    if (!equals(baseline, value)) return null;
  }
  return baseline;
};

const buildCommonLabels = (
  paths: string[],
  catalogs: Map<string, DeviceCatalog>,
  expectedCount: number,
  selector: (catalog: DeviceCatalog) => LabelList | null,
): Array<string | null> => {
  if (expectedCount <= 0) return [];
  const entries: Array<string | null> = Array.from(
    { length: expectedCount },
    () => null,
  );

  for (let index = 0; index < expectedCount; index += 1) {
    let label: string | null = null;
    let allMatch = true;
    for (const path of paths) {
      const list = selector(catalogs.get(path) ?? emptyCatalog());
      const value = list?.entries[index] ?? null;
      if (!value) {
        allMatch = false;
        break;
      }
      if (label === null) {
        label = value;
        continue;
      }
      if (label !== value) {
        allMatch = false;
        break;
      }
    }
    entries[index] = allMatch ? label : null;
  }

  return entries;
};

const consensusRtValues = (
  sessions: DeviceSession[],
  expectedCount: number,
): Array<number | null> => {
  if (expectedCount <= 0) return [];
  const values: Array<number | null> = Array.from(
    { length: expectedCount },
    () => null,
  );
  for (let index = 0; index < expectedCount; index += 1) {
    let candidate: number | null = null;
    let allMatch = true;
    for (const session of sessions) {
      const value = session.rtBuffers.get(index)?.value;
      if (typeof value !== "number") {
        allMatch = false;
        break;
      }
      if (candidate === null) {
        candidate = value;
        continue;
      }
      if (candidate !== value) {
        allMatch = false;
        break;
      }
    }
    values[index] = allMatch ? candidate : null;
  }
  return values;
};

export const uiConsensus = derived(
  [compatibleSessions, compatibility, deviceCatalogs],
  ([sessions, compat, catalogs]): UiConsensus => {
    const baselineInfo = compat.baseline;
    const baselinePath = compat.baselinePath;
    const compatiblePaths = compat.compatiblePaths;
    const mismatches = compat.mismatches;

    const stateValues = sessions.map((session) => session.state);
    const timingValues = sessions.map((session) => session.timing);
    const triggerValues = sessions.map((session) => session.trigger);
    const channelMapValues = sessions.map((session) => session.channelMap);

    const state = allPresent(stateValues)
      ? allEqual(stateValues, (left, right) => left.state === right.state)
      : null;
    const timing = allPresent(timingValues)
      ? allEqual(
          timingValues,
          (left, right) =>
            left.divider === right.divider && left.preTrig === right.preTrig,
        )
      : null;
    const trigger = allPresent(triggerValues)
      ? allEqual(
          triggerValues,
          (left, right) =>
            left.threshold === right.threshold &&
            left.channel === right.channel &&
            left.mode === right.mode,
        )
      : null;
    const channelMap = allPresent(channelMapValues)
      ? allEqual(channelMapValues, (left, right) =>
          arrayEqual(left.varIds, right.varIds),
        )
      : null;

    const channelLabels = buildCommonLabels(
      compatiblePaths,
      catalogs,
      baselineInfo?.numChannels ?? 0,
      (catalog) => catalog.channelLabels,
    );
    const rtLabels = buildCommonLabels(
      compatiblePaths,
      catalogs,
      baselineInfo?.rtCount ?? 0,
      (catalog) => catalog.rtLabels,
    );
    const varList = buildCommonLabels(
      compatiblePaths,
      catalogs,
      baselineInfo?.varCount ?? 0,
      (catalog) => catalog.varList,
    );

    const visibleChannels = channelLabels
      .map((label, index) => (label ? index : -1))
      .filter((index) => index >= 0);
    const visibleRtBuffers = rtLabels
      .map((label, index) => (label ? index : -1))
      .filter((index) => index >= 0);

    return {
      baselinePath,
      baselineInfo,
      compatiblePaths,
      mismatches,
      state,
      timing,
      trigger,
      channelMap,
      channelLabels,
      rtLabels,
      varList,
      visibleChannels,
      visibleRtBuffers,
    };
  },
);

export const uiRtConsensusValues = derived(
  [compatibleSessions, compatibility],
  ([sessions, compat]) =>
    consensusRtValues(sessions, compat.baseline?.rtCount ?? 0),
);
