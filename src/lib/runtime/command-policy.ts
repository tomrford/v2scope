import { get } from "svelte/store";
import { State } from "../protocol";
import { connectedDevices } from "../store/device-store";
import { runtimeMismatches } from "../store/runtime-warnings";
import { enqueueRuntimeCommand } from "../store/runtime";
import type { DeviceSnapshot } from "../store/device-store";
import type { RuntimeCommand } from "./RuntimeService";
import type { ControlMode } from "../store/runtime-policy-core";

export type GuardDecision = {
  allowed: boolean;
  reason?: string;
  targetPaths: string[];
  skipped: Array<{ path: string; reason: string }>;
};

export type CommandGuardFacts = {
  controlMode: ControlMode;
  connected: Array<Pick<DeviceSnapshot, "path" | "state">>;
  mismatchCount: number;
};

const emptyDecision = (reason: string): GuardDecision => ({
  allowed: false,
  reason,
  targetPaths: [],
  skipped: [],
});

const isMutatingCommand = (cmd: RuntimeCommand): boolean =>
  cmd.type === "setState" ||
  cmd.type === "trigger" ||
  cmd.type === "setTiming" ||
  cmd.type === "setChannelMap" ||
  cmd.type === "setTrigger" ||
  cmd.type === "setRtBuffer";

const commandTargets = (cmd: RuntimeCommand): readonly string[] | undefined => {
  switch (cmd.type) {
    case "setState":
    case "trigger":
    case "setTiming":
    case "setChannelMap":
    case "setTrigger":
    case "setRtBuffer":
      return cmd.targets;
    default:
      return undefined;
  }
};

const unique = (paths: readonly string[]): string[] =>
  Array.from(new Set(paths));

const resolveRequestedPaths = (
  cmd: RuntimeCommand,
  connectedPaths: string[],
): {
  requested: string[];
  skipped: Array<{ path: string; reason: string }>;
} => {
  const connectedSet = new Set(connectedPaths);
  const requestedTargets = commandTargets(cmd);
  if (!requestedTargets || requestedTargets.length === 0) {
    return { requested: connectedPaths, skipped: [] };
  }

  const skipped: Array<{ path: string; reason: string }> = [];
  const requested = unique(requestedTargets).filter((path) => {
    if (connectedSet.has(path)) return true;
    skipped.push({ path, reason: "not_connected" });
    return false;
  });
  return { requested, skipped };
};

const withTargets = (cmd: RuntimeCommand, targets: string[]): RuntimeCommand => {
  switch (cmd.type) {
    case "setState":
    case "trigger":
    case "setTiming":
    case "setChannelMap":
    case "setTrigger":
    case "setRtBuffer":
      return {
        ...cmd,
        targets,
      };
    default:
      return cmd;
  }
};

const evaluateSubsetCommand = (
  requestedPaths: string[],
  eligiblePaths: string[],
  ineligibleReason: string,
): GuardDecision => {
  const eligible = new Set(eligiblePaths);
  const targetPaths = requestedPaths.filter((path) => eligible.has(path));
  const skipped = requestedPaths
    .filter((path) => !eligible.has(path))
    .map((path) => ({ path, reason: ineligibleReason }));

  if (targetPaths.length === 0) {
    return {
      allowed: false,
      reason: "no_eligible_targets",
      targetPaths,
      skipped,
    };
  }

  return {
    allowed: true,
    targetPaths,
    skipped,
  };
};

export const evaluateCommand = (
  cmd: RuntimeCommand,
  facts: CommandGuardFacts,
): GuardDecision => {
  if (!isMutatingCommand(cmd)) {
    return { allowed: true, targetPaths: [], skipped: [] };
  }

  const connectedPaths = facts.connected.map((device) => device.path);
  const { requested, skipped: requestedSkips } = resolveRequestedPaths(
    cmd,
    connectedPaths,
  );

  if (requested.length === 0) {
    return {
      allowed: false,
      reason: "no_connected_targets",
      targetPaths: [],
      skipped: requestedSkips,
    };
  }

  const stopOnlyMode = facts.controlMode === "mismatch_stop_only";

  if (stopOnlyMode && !(cmd.type === "setState" && cmd.state === State.HALTED)) {
    return {
      allowed: false,
      reason: "stop_only",
      targetPaths: [],
      skipped: [...requestedSkips, ...requested.map((path) => ({ path, reason: "stop_only" }))],
    };
  }

  switch (cmd.type) {
    case "setState": {
      if (cmd.state === State.HALTED) {
        return {
          allowed: true,
          targetPaths: connectedPaths,
          skipped: requestedSkips,
        };
      }

      if (facts.controlMode !== "aligned_halted" || facts.mismatchCount > 0) {
        return {
          allowed: false,
          reason: "run_blocked",
          targetPaths: [],
          skipped: [...requestedSkips, ...requested.map((path) => ({ path, reason: "run_blocked" }))],
        };
      }

      return {
        allowed: true,
        targetPaths: requested,
        skipped: requestedSkips,
      };
    }

    case "setTiming": {
      const eligible = facts.connected
        .filter((device) => device.state?.state === State.HALTED)
        .map((device) => device.path);
      const decision = evaluateSubsetCommand(requested, eligible, "state_not_halted");
      return {
        ...decision,
        skipped: [...requestedSkips, ...decision.skipped],
      };
    }

    case "trigger":
    case "setTrigger":
    case "setChannelMap":
    case "setRtBuffer": {
      const decision = evaluateSubsetCommand(requested, requested, "ineligible");
      return {
        ...decision,
        skipped: [...requestedSkips, ...decision.skipped],
      };
    }

    default:
      return emptyDecision("unsupported_command");
  }
};

const currentGuardFacts = async (): Promise<CommandGuardFacts> => {
  const { runtimeControlMode } = await import("../store/runtime-policy.svelte");
  return {
    controlMode: get(runtimeControlMode),
    connected: get(connectedDevices),
    mismatchCount: get(runtimeMismatches).length,
  };
};

export const enqueueGuardedCommand = async (
  cmd: RuntimeCommand,
): Promise<GuardDecision> => {
  const facts = await currentGuardFacts();
  const decision = evaluateCommand(cmd, facts);
  if (!decision.allowed) {
    return decision;
  }

  if (isMutatingCommand(cmd)) {
    await enqueueRuntimeCommand(withTargets(cmd, decision.targetPaths));
    return decision;
  }

  await enqueueRuntimeCommand(cmd);
  return decision;
};
