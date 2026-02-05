import { derived } from "svelte/store";
import type { DeviceCatalog } from "./device-store";
import { connectedDevices } from "./device-store";
import type {
  ChannelMapResponse,
  DeviceInfo,
  StateResponse,
  TimingResponse,
  TriggerResponse,
} from "../protocol";
import { State } from "../protocol";

type ConsensusValue<T> = {
  value: T | null;
  aligned: boolean;
};

type StaticInfo = {
  numChannels: number;
  bufferSize: number;
  isrKhz: number;
};

type StaticConsensus = {
  value: StaticInfo | null;
  aligned: boolean;
  mismatches: Map<string, string[]>;
  compatiblePaths: string[];
};

type VariableConsensus = {
  ready: boolean;
  aligned: boolean;
  names: string[];
  nameToIdxByDevice: Map<string, Map<string, number>>;
};

type RtConsensus = {
  ready: boolean;
  aligned: boolean;
  valuesReady: boolean;
  names: string[];
  entries: Array<{ name: string; value: number | null }>;
  nameToIdxByDevice: Map<string, Map<string, number>>;
};

type ConsensusCompleteness = {
  state: boolean;
  timing: boolean;
  trigger: boolean;
  channelMap: boolean;
  variables: boolean;
  rtLabels: boolean;
  rtValues: boolean;
};

type ConsensusFlags = {
  allHalted: boolean;
  anyNonHalted: boolean;
  isStateAligned: boolean;
  hasRunStateMismatch: boolean;
  hasAnyMismatch: boolean;
};

type ConsensusMismatches = {
  staticMismatch: boolean;
  stateMismatch: boolean;
  timingMismatch: boolean;
  triggerMismatch: boolean;
  channelMapMismatch: boolean;
  rtMismatch: boolean;
  catalogMismatch: boolean;
};

export type DeviceConsensus = {
  staticInfo: StaticConsensus;
  state: ConsensusValue<StateResponse>;
  timing: ConsensusValue<TimingResponse>;
  trigger: ConsensusValue<TriggerResponse>;
  channelMap: ConsensusValue<ChannelMapResponse>;
  variables: VariableConsensus;
  rt: RtConsensus;
  completeness: ConsensusCompleteness;
  mismatches: ConsensusMismatches;
  flags: ConsensusFlags;
};

const compareStaticInfo = (baseline: DeviceInfo, other: DeviceInfo): string[] => {
  const mismatches: string[] = [];
  if (baseline.numChannels !== other.numChannels) mismatches.push("numChannels");
  if (baseline.bufferSize !== other.bufferSize) mismatches.push("bufferSize");
  if (baseline.isrKhz !== other.isrKhz) mismatches.push("isrKhz");
  return mismatches;
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

const arrayEqual = (a: readonly number[], b: readonly number[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const buildNameToIdx = (
  list: DeviceCatalog["varList"] | DeviceCatalog["rtLabels"],
) => {
  const map = new Map<string, number>();
  if (!list) return map;
  for (let i = 0; i < list.entries.length; i += 1) {
    const name = list.entries[i];
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, i);
    }
  }
  return map;
};

const intersectNames = (baseline: string[], maps: Map<string, number>[]): string[] => {
  if (baseline.length === 0 || maps.length === 0) return [];
  return baseline.filter((name) => maps.every((m) => m.has(name)));
};

const listReady = (list: DeviceCatalog["varList"] | DeviceCatalog["rtLabels"]) => {
  if (!list) return false;
  return list.entries.every((entry) => entry !== null);
};

const listEqual = (
  left: DeviceCatalog["varList"] | DeviceCatalog["rtLabels"],
  right: DeviceCatalog["varList"] | DeviceCatalog["rtLabels"],
) => {
  if (!left || !right) return false;
  if (left.totalCount !== right.totalCount) return false;
  if (left.entries.length !== right.entries.length) return false;
  for (let i = 0; i < left.entries.length; i += 1) {
    if (left.entries[i] !== right.entries[i]) return false;
  }
  return true;
};

const emptyConsensus = (): DeviceConsensus => ({
  staticInfo: {
    value: null,
    aligned: false,
    mismatches: new Map(),
    compatiblePaths: [],
  },
  state: { value: null, aligned: false },
  timing: { value: null, aligned: false },
  trigger: { value: null, aligned: false },
  channelMap: { value: null, aligned: false },
  variables: { ready: false, aligned: false, names: [], nameToIdxByDevice: new Map() },
  rt: {
    ready: false,
    aligned: false,
    valuesReady: false,
    names: [],
    entries: [],
    nameToIdxByDevice: new Map(),
  },
  completeness: {
    state: false,
    timing: false,
    trigger: false,
    channelMap: false,
    variables: false,
    rtLabels: false,
    rtValues: false,
  },
  mismatches: {
    staticMismatch: false,
    stateMismatch: false,
    timingMismatch: false,
    triggerMismatch: false,
    channelMapMismatch: false,
    rtMismatch: false,
    catalogMismatch: false,
  },
  flags: {
    allHalted: false,
    anyNonHalted: false,
    isStateAligned: false,
    hasRunStateMismatch: false,
    hasAnyMismatch: false,
  },
});

export const deviceConsensus = derived(
  connectedDevices,
  (devices): DeviceConsensus => {
    if (devices.length === 0) {
      return emptyConsensus();
    }

    const infos = devices.map((device) => device.info).filter(Boolean) as DeviceInfo[];
    const staticMismatches = new Map<string, string[]>();
    const baselineInfo = infos[0] ?? null;
    const compatiblePaths: string[] = [];

    if (baselineInfo) {
      for (const device of devices) {
        if (!device.info) {
          staticMismatches.set(device.path, ["info"]);
          continue;
        }
        const diff = compareStaticInfo(baselineInfo, device.info);
        if (diff.length > 0) {
          staticMismatches.set(device.path, diff);
        } else {
          compatiblePaths.push(device.path);
        }
      }
    }

    const staticInfoAligned = baselineInfo !== null && staticMismatches.size === 0;

    const staticInfoValue = staticInfoAligned
      ? {
          numChannels: baselineInfo.numChannels,
          bufferSize: baselineInfo.bufferSize,
          isrKhz: baselineInfo.isrKhz,
        }
      : null;

    const stateItems = devices.map((device) => device.state);
    const timingItems = devices.map((device) => device.timing);
    const triggerItems = devices.map((device) => device.trigger);
    const channelMapItems = devices.map((device) => device.channelMap);

    const stateComplete = stateItems.every((item) => item !== null);
    const timingComplete = timingItems.every((item) => item !== null);
    const triggerComplete = triggerItems.every((item) => item !== null);
    const channelMapComplete = channelMapItems.every((item) => item !== null);

    const stateValues = stateItems.filter(Boolean) as StateResponse[];
    const timingValues = timingItems.filter(Boolean) as TimingResponse[];
    const triggerValues = triggerItems.filter(Boolean) as TriggerResponse[];
    const channelMapValues = channelMapItems.filter(Boolean) as ChannelMapResponse[];

    const stateConsensus = allEqual(
      stateValues,
      (left, right) => left.state === right.state,
    );
    const timingConsensus = allEqual(
      timingValues,
      (left, right) =>
        left.divider === right.divider && left.preTrig === right.preTrig,
    );
    const triggerConsensus = allEqual(
      triggerValues,
      (left, right) =>
        left.threshold === right.threshold &&
        left.channel === right.channel &&
        left.mode === right.mode,
    );
    const channelMapConsensus = allEqual(
      channelMapValues,
      (left, right) => arrayEqual(left.varIds, right.varIds),
    );

    const stateAligned = stateComplete && stateConsensus !== null;
    const timingAligned = timingComplete && timingConsensus !== null;
    const triggerAligned = triggerComplete && triggerConsensus !== null;
    const channelMapAligned = channelMapComplete && channelMapConsensus !== null;

    const variablesReady = devices.every((device) => listReady(device.catalog.varList));
    const rtLabelsReady = devices.every((device) => listReady(device.catalog.rtLabels));

    const varNameToIdxByDevice = new Map<string, Map<string, number>>();
    for (const device of devices) {
      varNameToIdxByDevice.set(device.path, buildNameToIdx(device.catalog.varList));
    }

    const rtNameToIdxByDevice = new Map<string, Map<string, number>>();
    for (const device of devices) {
      rtNameToIdxByDevice.set(device.path, buildNameToIdx(device.catalog.rtLabels));
    }

    const baselineVarEntries = devices[0].catalog.varList;
    const baselineRtEntries = devices[0].catalog.rtLabels;

    const variableCatalogAligned =
      variablesReady &&
      devices.every((device) => listEqual(device.catalog.varList, baselineVarEntries));

    const rtCatalogAligned =
      rtLabelsReady &&
      devices.every((device) => listEqual(device.catalog.rtLabels, baselineRtEntries));

    const baselineVarNames = variablesReady
      ? (devices[0].catalog.varList?.entries.filter(Boolean) as string[])
      : [];
    const varNames = variablesReady
      ? intersectNames(baselineVarNames, Array.from(varNameToIdxByDevice.values()))
      : [];

    const baselineRtNames = rtLabelsReady
      ? (devices[0].catalog.rtLabels?.entries.filter(Boolean) as string[])
      : [];
    const rtNames = rtLabelsReady
      ? intersectNames(baselineRtNames, Array.from(rtNameToIdxByDevice.values()))
      : [];

    let rtValuesReady = rtLabelsReady;
    const rtEntries = rtNames.map((name) => {
      const values: number[] = [];
      for (const device of devices) {
        const idx = rtNameToIdxByDevice.get(device.path)?.get(name);
        const value = idx !== undefined ? device.rtBuffers.get(idx)?.value : undefined;
        if (typeof value === "number") {
          values.push(value);
        } else {
          rtValuesReady = false;
        }
      }

      const valueConsensus =
        values.length === devices.length && values.every((v) => v === values[0])
          ? values[0]
          : null;

      return { name, value: valueConsensus };
    });

    const staticMismatch = !staticInfoAligned;
    const stateMismatch = stateComplete && !stateAligned;
    const timingMismatch = timingComplete && !timingAligned;
    const triggerMismatch = triggerComplete && !triggerAligned;
    const channelMapMismatch = channelMapComplete && !channelMapAligned;
    const rtMismatch = rtValuesReady && rtEntries.some((entry) => entry.value === null);
    const catalogMismatch =
      (variablesReady && !variableCatalogAligned) ||
      (rtLabelsReady && !rtCatalogAligned);

    const allHalted =
      stateComplete && stateValues.every((state) => state.state === State.HALTED);
    const anyNonHalted = stateValues.some((state) => state.state !== State.HALTED);
    const hasRunStateMismatch = stateMismatch;
    const hasAnyMismatch =
      staticMismatch ||
      stateMismatch ||
      timingMismatch ||
      triggerMismatch ||
      channelMapMismatch ||
      rtMismatch ||
      catalogMismatch;

    return {
      staticInfo: {
        value: staticInfoValue,
        aligned: staticInfoAligned,
        mismatches: staticMismatches,
        compatiblePaths,
      },
      state: { value: stateAligned ? stateConsensus : null, aligned: stateAligned },
      timing: {
        value: timingAligned ? timingConsensus : null,
        aligned: timingAligned,
      },
      trigger: {
        value: triggerAligned ? triggerConsensus : null,
        aligned: triggerAligned,
      },
      channelMap: {
        value: channelMapAligned ? channelMapConsensus : null,
        aligned: channelMapAligned,
      },
      variables: {
        ready: variablesReady,
        aligned: variableCatalogAligned,
        names: varNames,
        nameToIdxByDevice: varNameToIdxByDevice,
      },
      rt: {
        ready: rtLabelsReady,
        aligned: rtCatalogAligned,
        valuesReady: rtValuesReady,
        names: rtNames,
        entries: rtEntries,
        nameToIdxByDevice: rtNameToIdxByDevice,
      },
      completeness: {
        state: stateComplete,
        timing: timingComplete,
        trigger: triggerComplete,
        channelMap: channelMapComplete,
        variables: variablesReady,
        rtLabels: rtLabelsReady,
        rtValues: rtValuesReady,
      },
      mismatches: {
        staticMismatch,
        stateMismatch,
        timingMismatch,
        triggerMismatch,
        channelMapMismatch,
        rtMismatch,
        catalogMismatch,
      },
      flags: {
        allHalted,
        anyNonHalted,
        isStateAligned: stateAligned,
        hasRunStateMismatch,
        hasAnyMismatch,
      },
    };
  },
);
