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

type CatalogEntry = {
  idx: number;
  name: string;
};

type VariableConsensus = {
  ready: boolean;
  aligned: boolean;
  entries: CatalogEntry[];
};

type RtConsensus = {
  ready: boolean;
  aligned: boolean;
  valuesReady: boolean;
  entries: Array<{ idx: number; name: string; value: number | null }>;
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
  variables: { ready: false, aligned: false, entries: [] },
  rt: {
    ready: false,
    aligned: false,
    valuesReady: false,
    entries: [],
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

    const baselineVarEntries = devices[0].catalog.varList;
    const baselineRtEntries = devices[0].catalog.rtLabels;

    const variableCatalogAligned =
      variablesReady &&
      devices.every((device) => listEqual(device.catalog.varList, baselineVarEntries));

    const rtCatalogAligned =
      rtLabelsReady &&
      devices.every((device) => listEqual(device.catalog.rtLabels, baselineRtEntries));

    const variableEntries =
      variableCatalogAligned && baselineVarEntries
        ? baselineVarEntries.entries
            .map((name, idx) => (name ? { idx, name } : null))
            .filter(Boolean) as CatalogEntry[]
        : [];

    let rtValuesReady = rtLabelsReady;
    const rtEntries =
      rtCatalogAligned && baselineRtEntries
        ? baselineRtEntries.entries.map((rawName, idx) => {
            const values: number[] = [];
            for (const device of devices) {
              const value = device.rtBuffers.get(idx)?.value;
              if (typeof value === "number") {
                values.push(value);
              } else {
                rtValuesReady = false;
              }
            }

            const valueConsensus =
              values.length === devices.length &&
              values.every((v) => v === values[0])
                ? values[0]
                : null;

            return {
              idx,
              name: rawName && rawName.length > 0 ? rawName : `RT ${idx + 1}`,
              value: valueConsensus,
            };
          })
        : [];

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
        entries: variableEntries,
      },
      rt: {
        ready: rtLabelsReady,
        aligned: rtCatalogAligned,
        valuesReady: rtValuesReady,
        entries: rtEntries,
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
