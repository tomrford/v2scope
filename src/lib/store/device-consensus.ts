import { derived, type Readable } from "svelte/store";
import { connectedDevices } from "./device-store";
import {
  computeConsensus,
  staticInfoEqual,
  stateConsensusEqual,
  timingConsensusEqual,
  triggerConsensusEqual,
  channelMapConsensusEqual,
  variableConsensusEqual,
  rtConsensusEqual,
  completenessEqual,
  mismatchesEqual,
  flagsEqual,
  type DeviceConsensus,
  type StaticConsensus,
  type ConsensusValue,
  type VariableConsensus,
  type RtConsensus,
  type ConsensusCompleteness,
  type ConsensusMismatches,
  type ConsensusFlags,
} from "./device-consensus-core";
import type {
  StateResponse,
  TimingResponse,
  TriggerResponse,
  ChannelMapResponse,
} from "../protocol";

// Re-export types for consumers
export type {
  DeviceConsensus,
  StaticConsensus,
  ConsensusValue,
  CatalogEntry,
  VariableConsensus,
  RtConsensus,
  ConsensusCompleteness,
  ConsensusMismatches,
  ConsensusFlags,
  StaticInfo,
} from "./device-consensus-core";

// ---------------------------------------------------------------------------
// Memoized slice helper
//
// Creates a derived store that selects a slice from a source store and returns
// the *previous reference* when the slice is structurally unchanged. Because
// Svelte's `set()` uses reference equality, unchanged slices produce zero
// downstream notifications.
// ---------------------------------------------------------------------------

const UNSET = Symbol();

function memoSlice<F, O>(
  source: Readable<F>,
  select: (full: F) => O,
  equal: (prev: O, next: O) => boolean,
): Readable<O> {
  let prev: O | typeof UNSET = UNSET;
  return derived(source, (full) => {
    const next = select(full);
    if (prev !== UNSET && equal(prev, next)) return prev;
    prev = next;
    return next;
  });
}

// ---------------------------------------------------------------------------
// Internal: full consensus (single pass, fires every tick)
// ---------------------------------------------------------------------------

const _fullConsensus = derived(connectedDevices, computeConsensus);

// ---------------------------------------------------------------------------
// Public: memoized sub-stores (only notify when their slice actually changes)
// ---------------------------------------------------------------------------

export const consensusStaticInfo: Readable<StaticConsensus> = memoSlice(
  _fullConsensus,
  (c) => c.staticInfo,
  staticInfoEqual,
);

export const consensusState: Readable<ConsensusValue<StateResponse>> = memoSlice(
  _fullConsensus,
  (c) => c.state,
  stateConsensusEqual,
);

export const consensusTiming: Readable<ConsensusValue<TimingResponse>> = memoSlice(
  _fullConsensus,
  (c) => c.timing,
  timingConsensusEqual,
);

export const consensusTrigger: Readable<ConsensusValue<TriggerResponse>> = memoSlice(
  _fullConsensus,
  (c) => c.trigger,
  triggerConsensusEqual,
);

export const consensusChannelMap: Readable<ConsensusValue<ChannelMapResponse>> =
  memoSlice(_fullConsensus, (c) => c.channelMap, channelMapConsensusEqual);

export const consensusVariables: Readable<VariableConsensus> = memoSlice(
  _fullConsensus,
  (c) => c.variables,
  variableConsensusEqual,
);

export const consensusRt: Readable<RtConsensus> = memoSlice(
  _fullConsensus,
  (c) => c.rt,
  rtConsensusEqual,
);

export const consensusCompleteness: Readable<ConsensusCompleteness> = memoSlice(
  _fullConsensus,
  (c) => c.completeness,
  completenessEqual,
);

export const consensusMismatches: Readable<ConsensusMismatches> = memoSlice(
  _fullConsensus,
  (c) => c.mismatches,
  mismatchesEqual,
);

export const consensusFlags: Readable<ConsensusFlags> = memoSlice(
  _fullConsensus,
  (c) => c.flags,
  flagsEqual,
);

// ---------------------------------------------------------------------------
// Backward-compatible composite store
//
// Derives from all memoized sub-stores. Only runs (and notifies) when at least
// one sub-store actually changed — far less often than every poll tick.
// ---------------------------------------------------------------------------

export const deviceConsensus: Readable<DeviceConsensus> = derived(
  [
    consensusStaticInfo,
    consensusState,
    consensusTiming,
    consensusTrigger,
    consensusChannelMap,
    consensusVariables,
    consensusRt,
    consensusCompleteness,
    consensusMismatches,
    consensusFlags,
  ],
  ([
    staticInfo,
    state,
    timing,
    trigger,
    channelMap,
    variables,
    rt,
    completeness,
    mismatches,
    flags,
  ]): DeviceConsensus => ({
    staticInfo,
    state,
    timing,
    trigger,
    channelMap,
    variables,
    rt,
    completeness,
    mismatches,
    flags,
  }),
);
