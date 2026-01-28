import { derived } from "svelte/store";
import type {
  DeviceSnapshot,
  DeviceCatalog,
} from "./device-store";
import { connectedDevices } from "./device-store";
import type {
  ChannelMapResponse,
  DeviceInfo,
  StateResponse,
  TimingResponse,
  TriggerResponse,
} from "../protocol";

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
  names: string[];
  nameToIdxByDevice: Map<string, Map<string, number>>;
};

type RtConsensus = {
  ready: boolean;
  names: string[];
  entries: Array<{ name: string; value: number | null }>;
  nameToIdxByDevice: Map<string, Map<string, number>>;
};

type DeviceConsensus = {
  staticInfo: StaticConsensus;
  state: ConsensusValue<StateResponse>;
  timing: ConsensusValue<TimingResponse>;
  trigger: ConsensusValue<TriggerResponse>;
  channelMap: ConsensusValue<ChannelMapResponse>;
  variables: VariableConsensus;
  rt: RtConsensus;
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

const buildNameToIdx = (list: DeviceCatalog["varList"] | DeviceCatalog["rtLabels"]) => {
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

const intersectNames = (
  baseline: string[],
  maps: Map<string, number>[],
): string[] => {
  if (baseline.length === 0 || maps.length === 0) return [];
  return baseline.filter((name) => maps.every((m) => m.has(name)));
};

const varListReady = (devices: DeviceSnapshot[]) =>
  devices.length > 0 &&
  devices.every((device) => device.catalog.varList?.entries.length);

const rtLabelsReady = (devices: DeviceSnapshot[]) =>
  devices.length > 0 &&
  devices.every((device) => device.catalog.rtLabels?.entries.length);

export const deviceConsensus = derived(
  connectedDevices,
  (devices): DeviceConsensus => {
    if (devices.length === 0) {
      return {
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
        variables: { ready: false, names: [], nameToIdxByDevice: new Map() },
        rt: { ready: false, names: [], entries: [], nameToIdxByDevice: new Map() },
      };
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

    const staticInfoAligned =
      baselineInfo !== null && staticMismatches.size === 0;

    const staticInfoValue = staticInfoAligned
      ? {
          numChannels: baselineInfo.numChannels,
          bufferSize: baselineInfo.bufferSize,
          isrKhz: baselineInfo.isrKhz,
        }
      : null;

    const stateValues = devices
      .map((device) => device.state)
      .filter(Boolean) as StateResponse[];
    const timingValues = devices
      .map((device) => device.timing)
      .filter(Boolean) as TimingResponse[];
    const triggerValues = devices
      .map((device) => device.trigger)
      .filter(Boolean) as TriggerResponse[];
    const channelMapValues = devices
      .map((device) => device.channelMap)
      .filter(Boolean) as ChannelMapResponse[];

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

    const stateAligned =
      stateConsensus !== null && stateValues.length === devices.length;
    const timingAligned =
      timingConsensus !== null && timingValues.length === devices.length;
    const triggerAligned =
      triggerConsensus !== null && triggerValues.length === devices.length;
    const channelMapAligned =
      channelMapConsensus !== null &&
      channelMapValues.length === devices.length;

    const varReady = varListReady(devices);
    const varNameToIdxByDevice = new Map<string, Map<string, number>>();
    for (const device of devices) {
      varNameToIdxByDevice.set(
        device.path,
        buildNameToIdx(device.catalog.varList),
      );
    }

    const baselineVarNames = varReady
      ? (devices[0].catalog.varList?.entries.filter(Boolean) as string[])
      : [];
    const varNames = varReady
      ? intersectNames(
          baselineVarNames,
          Array.from(varNameToIdxByDevice.values()),
        )
      : [];

    const rtReady = rtLabelsReady(devices);
    const rtNameToIdxByDevice = new Map<string, Map<string, number>>();
    for (const device of devices) {
      rtNameToIdxByDevice.set(
        device.path,
        buildNameToIdx(device.catalog.rtLabels),
      );
    }

    const baselineRtNames = rtReady
      ? (devices[0].catalog.rtLabels?.entries.filter(Boolean) as string[])
      : [];
    const rtNames = rtReady
      ? intersectNames(
          baselineRtNames,
          Array.from(rtNameToIdxByDevice.values()),
        )
      : [];

    const rtEntries = rtNames.map((name) => {
      const values: number[] = [];
      for (const device of devices) {
        const idx = rtNameToIdxByDevice.get(device.path)?.get(name);
        const value = idx !== undefined ? device.rtBuffers.get(idx)?.value : undefined;
        if (typeof value === "number") {
          values.push(value);
        }
      }

      const valueConsensus =
        values.length === devices.length && values.every((v) => v === values[0])
          ? values[0]
          : null;

      return { name, value: valueConsensus };
    });

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
        ready: varReady,
        names: varNames,
        nameToIdxByDevice: varNameToIdxByDevice,
      },
      rt: {
        ready: rtReady,
        names: rtNames,
        entries: rtEntries,
        nameToIdxByDevice: rtNameToIdxByDevice,
      },
    };
  },
);
