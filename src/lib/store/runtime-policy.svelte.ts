import { FiniteStateMachine } from "runed";
import { derived } from "svelte/store";
import { State } from "../protocol";
import { connectedDevices } from "./device-store";
import {
  consensusCompleteness,
  consensusFlags,
} from "./device-consensus";
import { runtimeMismatches } from "./runtime-warnings";
import {
  canRequestRun,
  canRequestStop,
  determineControlMode,
  getRuntimeCommandPermissions,
  stopOnly,
  type ControlMode,
  type RuntimeCommandPermissions,
  type RuntimePolicyFacts,
} from "./runtime-policy-core";

const requiredComplete = (facts: {
  state: boolean;
  timing: boolean;
  trigger: boolean;
  channelMap: boolean;
  variables: boolean;
  rtLabels: boolean;
  rtValues: boolean;
}): boolean =>
  facts.state &&
  facts.timing &&
  facts.trigger &&
  facts.channelMap &&
  facts.variables &&
  facts.rtLabels &&
  facts.rtValues;

const evaluateAction = (...args: unknown[]) =>
  determineControlMode(args[0] as RuntimePolicyFacts);

const fsm = new FiniteStateMachine<ControlMode, "EVALUATE">("empty", {
  empty: { EVALUATE: evaluateAction },
  syncing: { EVALUATE: evaluateAction },
  aligned_halted: { EVALUATE: evaluateAction },
  aligned_non_halted: { EVALUATE: evaluateAction },
  mismatch_run_blocked: { EVALUATE: evaluateAction },
  mismatch_stop_only: { EVALUATE: evaluateAction },
  "*": { EVALUATE: evaluateAction },
});

export const runtimePolicyFacts = derived(
  [connectedDevices, consensusCompleteness, consensusFlags, runtimeMismatches],
  ([$connectedDevices, $completeness, $flags, $runtimeMismatches]): RuntimePolicyFacts => {
    const connectedCount = $connectedDevices.length;
    const haltedCount = $connectedDevices.filter(
      (device) => device.state?.state === State.HALTED,
    ).length;

    return {
      connectedCount,
      haltedCount,
      hasMissingData:
        connectedCount > 0 && !requiredComplete($completeness),
      hasRunStateMismatch: $flags.hasRunStateMismatch,
      hasAnyMismatch:
        $flags.hasAnyMismatch || $runtimeMismatches.length > 0,
      allHalted: $flags.allHalted,
      anyNonHalted: $flags.anyNonHalted,
    };
  },
);

export const runtimeControlMode = derived(runtimePolicyFacts, ($facts) =>
  fsm.send("EVALUATE", $facts),
);

export const runtimeCanRequestRun = derived(runtimeControlMode, ($mode) =>
  canRequestRun($mode),
);

export const runtimeStopOnly = derived(runtimeControlMode, ($mode) =>
  stopOnly($mode),
);

export const runtimeCanRequestStop = derived(runtimePolicyFacts, ($facts) =>
  canRequestStop($facts),
);

export const runtimeCommandPermissions = derived(
  [runtimeControlMode, runtimePolicyFacts],
  ([$mode, $facts]): RuntimeCommandPermissions =>
    getRuntimeCommandPermissions($mode, $facts),
);
