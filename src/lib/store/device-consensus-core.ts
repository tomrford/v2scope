import type { DeviceCatalog, DeviceSnapshot } from "./device-store";
import type {
  ChannelMapResponse,
  DeviceInfo,
  StateResponse,
  TimingResponse,
  TriggerResponse,
} from "../protocol";
import { State } from "../protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsensusValue<T> = {
  value: T | null;
  aligned: boolean;
};

export type StaticInfo = {
  numChannels: number;
  bufferSize: number;
  isrKhz: number;
};

export type StaticConsensus = {
  value: StaticInfo | null;
  aligned: boolean;
  mismatches: Map<string, string[]>;
  compatiblePaths: string[];
};

export type CatalogEntry = {
  idx: number;
  name: string;
};

export type VariableConsensus = {
  ready: boolean;
  aligned: boolean;
  entries: CatalogEntry[];
};

export type RtConsensus = {
  ready: boolean;
  aligned: boolean;
  valuesReady: boolean;
  entries: Array<{ idx: number; name: string; value: number | null }>;
};

export type ConsensusCompleteness = {
  state: boolean;
  timing: boolean;
  trigger: boolean;
  channelMap: boolean;
  variables: boolean;
  rtLabels: boolean;
  rtValues: boolean;
};

export type ConsensusMismatches = {
  staticMismatch: boolean;
  stateMismatch: boolean;
  timingMismatch: boolean;
  triggerMismatch: boolean;
  channelMapMismatch: boolean;
  rtMismatch: boolean;
  catalogMismatch: boolean;
};

export type ConsensusFlags = {
  allHalted: boolean;
  anyNonHalted: boolean;
  isStateAligned: boolean;
  hasRunStateMismatch: boolean;
  hasAnyMismatch: boolean;
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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

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

export const arrayEqual = (a: readonly number[], b: readonly number[]): boolean => {
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

// ---------------------------------------------------------------------------
// Empty / default values
// ---------------------------------------------------------------------------

export const emptyStaticInfo: StaticConsensus = {
  value: null,
  aligned: false,
  mismatches: new Map(),
  compatiblePaths: [],
};

export const emptyState: ConsensusValue<StateResponse> = {
  value: null,
  aligned: false,
};

export const emptyTiming: ConsensusValue<TimingResponse> = {
  value: null,
  aligned: false,
};

export const emptyTrigger: ConsensusValue<TriggerResponse> = {
  value: null,
  aligned: false,
};

export const emptyChannelMap: ConsensusValue<ChannelMapResponse> = {
  value: null,
  aligned: false,
};

export const emptyVariables: VariableConsensus = {
  ready: false,
  aligned: false,
  entries: [],
};

export const emptyRt: RtConsensus = {
  ready: false,
  aligned: false,
  valuesReady: false,
  entries: [],
};

export const emptyCompleteness: ConsensusCompleteness = {
  state: false,
  timing: false,
  trigger: false,
  channelMap: false,
  variables: false,
  rtLabels: false,
  rtValues: false,
};

export const emptyMismatches: ConsensusMismatches = {
  staticMismatch: false,
  stateMismatch: false,
  timingMismatch: false,
  triggerMismatch: false,
  channelMapMismatch: false,
  rtMismatch: false,
  catalogMismatch: false,
};

export const emptyFlags: ConsensusFlags = {
  allHalted: false,
  anyNonHalted: false,
  isStateAligned: false,
  hasRunStateMismatch: false,
  hasAnyMismatch: false,
};

export const emptyConsensus = (): DeviceConsensus => ({
  staticInfo: emptyStaticInfo,
  state: emptyState,
  timing: emptyTiming,
  trigger: emptyTrigger,
  channelMap: emptyChannelMap,
  variables: emptyVariables,
  rt: emptyRt,
  completeness: emptyCompleteness,
  mismatches: emptyMismatches,
  flags: emptyFlags,
});

// ---------------------------------------------------------------------------
// Full consensus computation (single pass)
// ---------------------------------------------------------------------------

export const computeConsensus = (devices: DeviceSnapshot[]): DeviceConsensus => {
  if (devices.length === 0) {
    return emptyConsensus();
  }

  // --- Static info ---
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

  // --- Per-field consensus ---
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

  // --- Catalogs ---
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

  // --- Mismatches ---
  const staticMismatch = !staticInfoAligned;
  const stateMismatch = stateComplete && !stateAligned;
  const timingMismatch = timingComplete && !timingAligned;
  const triggerMismatch = triggerComplete && !triggerAligned;
  const channelMapMismatch = channelMapComplete && !channelMapAligned;
  const rtMismatch = rtValuesReady && rtEntries.some((entry) => entry.value === null);
  const catalogMismatch =
    (variablesReady && !variableCatalogAligned) ||
    (rtLabelsReady && !rtCatalogAligned);

  // --- Flags ---
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
};

// ---------------------------------------------------------------------------
// Structural equality — used by memoized stores to skip spurious notifications
// ---------------------------------------------------------------------------

export const staticInfoEqual = (a: StaticConsensus, b: StaticConsensus): boolean =>
  a.aligned === b.aligned &&
  a.mismatches.size === b.mismatches.size &&
  a.compatiblePaths.length === b.compatiblePaths.length &&
  (a.value === b.value ||
    (a.value !== null &&
      b.value !== null &&
      a.value.numChannels === b.value.numChannels &&
      a.value.bufferSize === b.value.bufferSize &&
      a.value.isrKhz === b.value.isrKhz));

export const stateConsensusEqual = (
  a: ConsensusValue<StateResponse>,
  b: ConsensusValue<StateResponse>,
): boolean =>
  a.aligned === b.aligned && a.value?.state === b.value?.state;

export const timingConsensusEqual = (
  a: ConsensusValue<TimingResponse>,
  b: ConsensusValue<TimingResponse>,
): boolean =>
  a.aligned === b.aligned &&
  a.value?.divider === b.value?.divider &&
  a.value?.preTrig === b.value?.preTrig;

export const triggerConsensusEqual = (
  a: ConsensusValue<TriggerResponse>,
  b: ConsensusValue<TriggerResponse>,
): boolean =>
  a.aligned === b.aligned &&
  a.value?.threshold === b.value?.threshold &&
  a.value?.channel === b.value?.channel &&
  a.value?.mode === b.value?.mode;

export const channelMapConsensusEqual = (
  a: ConsensusValue<ChannelMapResponse>,
  b: ConsensusValue<ChannelMapResponse>,
): boolean =>
  a.aligned === b.aligned &&
  arrayEqual(a.value?.varIds ?? [], b.value?.varIds ?? []);

export const variableConsensusEqual = (
  a: VariableConsensus,
  b: VariableConsensus,
): boolean => {
  if (a.ready !== b.ready || a.aligned !== b.aligned) return false;
  if (a.entries.length !== b.entries.length) return false;
  for (let i = 0; i < a.entries.length; i += 1) {
    if (a.entries[i].idx !== b.entries[i].idx || a.entries[i].name !== b.entries[i].name)
      return false;
  }
  return true;
};

export const rtConsensusEqual = (a: RtConsensus, b: RtConsensus): boolean => {
  if (
    a.ready !== b.ready ||
    a.aligned !== b.aligned ||
    a.valuesReady !== b.valuesReady
  )
    return false;
  if (a.entries.length !== b.entries.length) return false;
  for (let i = 0; i < a.entries.length; i += 1) {
    if (
      a.entries[i].idx !== b.entries[i].idx ||
      a.entries[i].name !== b.entries[i].name ||
      a.entries[i].value !== b.entries[i].value
    )
      return false;
  }
  return true;
};

export const completenessEqual = (
  a: ConsensusCompleteness,
  b: ConsensusCompleteness,
): boolean =>
  a.state === b.state &&
  a.timing === b.timing &&
  a.trigger === b.trigger &&
  a.channelMap === b.channelMap &&
  a.variables === b.variables &&
  a.rtLabels === b.rtLabels &&
  a.rtValues === b.rtValues;

export const mismatchesEqual = (
  a: ConsensusMismatches,
  b: ConsensusMismatches,
): boolean =>
  a.staticMismatch === b.staticMismatch &&
  a.stateMismatch === b.stateMismatch &&
  a.timingMismatch === b.timingMismatch &&
  a.triggerMismatch === b.triggerMismatch &&
  a.channelMapMismatch === b.channelMapMismatch &&
  a.rtMismatch === b.rtMismatch &&
  a.catalogMismatch === b.catalogMismatch;

export const flagsEqual = (a: ConsensusFlags, b: ConsensusFlags): boolean =>
  a.allHalted === b.allHalted &&
  a.anyNonHalted === b.anyNonHalted &&
  a.isStateAligned === b.isStateAligned &&
  a.hasRunStateMismatch === b.hasRunStateMismatch &&
  a.hasAnyMismatch === b.hasAnyMismatch;
