export type ControlMode =
  | "empty"
  | "syncing"
  | "aligned_halted"
  | "aligned_non_halted"
  | "mismatch_run_blocked"
  | "mismatch_stop_only";

export type RuntimePolicyFacts = {
  connectedCount: number;
  haltedCount: number;
  hasMissingData: boolean;
  hasRunStateMismatch: boolean;
  hasAnyMismatch: boolean;
  allHalted: boolean;
  anyNonHalted: boolean;
};

export const determineControlMode = (facts: RuntimePolicyFacts): ControlMode => {
  if (facts.connectedCount === 0) return "empty";
  if (facts.hasMissingData) return "syncing";
  if (facts.hasRunStateMismatch) return "mismatch_stop_only";
  if (facts.hasAnyMismatch) return "mismatch_run_blocked";
  if (facts.allHalted) return "aligned_halted";
  if (facts.anyNonHalted) return "aligned_non_halted";
  return "syncing";
};

export type RuntimeCommandPermissions = {
  setTiming: boolean;
  setTrigger: boolean;
  setRtBuffer: boolean;
  setChannelMap: boolean;
  trigger: boolean;
  setRunState: boolean;
  setStopState: boolean;
};

export const canRequestRun = (mode: ControlMode): boolean =>
  mode === "aligned_halted";

export const stopOnly = (mode: ControlMode): boolean =>
  mode === "mismatch_stop_only";

export const canRequestStop = (facts: RuntimePolicyFacts): boolean =>
  facts.connectedCount > 0;

export const getRuntimeCommandPermissions = (
  mode: ControlMode,
  facts: RuntimePolicyFacts,
): RuntimeCommandPermissions => {
  const stopOnlyMode = stopOnly(mode);
  const hasConnected = facts.connectedCount > 0;
  return {
    setTiming: !stopOnlyMode && facts.haltedCount > 0,
    setTrigger: !stopOnlyMode && hasConnected,
    setRtBuffer: !stopOnlyMode && hasConnected,
    setChannelMap: hasConnected,
    trigger: !stopOnlyMode && hasConnected,
    setRunState: canRequestRun(mode),
    setStopState: canRequestStop(facts),
  };
};
