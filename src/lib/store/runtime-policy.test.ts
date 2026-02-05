import { describe, expect, it } from "bun:test";
import {
  canRequestRun,
  canRequestStop,
  determineControlMode,
  getRuntimeCommandPermissions,
  type RuntimePolicyFacts,
} from "./runtime-policy-core";

const facts = (overrides: Partial<RuntimePolicyFacts> = {}): RuntimePolicyFacts => ({
  connectedCount: 2,
  haltedCount: 2,
  hasMissingData: false,
  hasRunStateMismatch: false,
  hasAnyMismatch: false,
  allHalted: true,
  anyNonHalted: false,
  ...overrides,
});

describe("runtime policy core", () => {
  it("returns empty for no connected devices", () => {
    const mode = determineControlMode(facts({ connectedCount: 0, haltedCount: 0 }));
    expect(mode).toBe("empty");
    expect(canRequestStop(facts({ connectedCount: 0, haltedCount: 0 }))).toBe(false);
  });

  it("returns syncing when required data is incomplete", () => {
    const mode = determineControlMode(facts({ hasMissingData: true }));
    expect(mode).toBe("syncing");
    expect(canRequestRun(mode)).toBe(false);
  });

  it("enters stop-only mode on run-state mismatch", () => {
    const mode = determineControlMode(
      facts({
        hasRunStateMismatch: true,
        hasAnyMismatch: true,
        allHalted: false,
        anyNonHalted: true,
      }),
    );
    expect(mode).toBe("mismatch_stop_only");

    const permissions = getRuntimeCommandPermissions(
      mode,
      facts({ hasRunStateMismatch: true, hasAnyMismatch: true, allHalted: false, anyNonHalted: true }),
    );
    expect(permissions.setStopState).toBe(true);
    expect(permissions.setRunState).toBe(false);
    expect(permissions.setTiming).toBe(false);
    expect(permissions.setRtBuffer).toBe(false);
    expect(permissions.setChannelMap).toBe(true);
  });

  it("blocks RUNNING in mismatch_run_blocked mode", () => {
    const mode = determineControlMode(
      facts({ hasAnyMismatch: true, allHalted: false, anyNonHalted: true }),
    );
    expect(mode).toBe("mismatch_run_blocked");

    const permissions = getRuntimeCommandPermissions(
      mode,
      facts({ hasAnyMismatch: true, allHalted: false, anyNonHalted: true, haltedCount: 1 }),
    );
    expect(permissions.setRunState).toBe(false);
    expect(permissions.setStopState).toBe(true);
    expect(permissions.setTiming).toBe(true);
  });

  it("aligned modes expose run/stop correctly", () => {
    const haltedMode = determineControlMode(facts());
    expect(haltedMode).toBe("aligned_halted");
    expect(canRequestRun(haltedMode)).toBe(true);

    const runningMode = determineControlMode(
      facts({
        haltedCount: 0,
        allHalted: false,
        anyNonHalted: true,
      }),
    );
    expect(runningMode).toBe("aligned_non_halted");
    expect(canRequestRun(runningMode)).toBe(false);
  });
});
