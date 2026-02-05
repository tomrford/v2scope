import { describe, expect, it } from "bun:test";
import { State, TriggerMode } from "../protocol";
import { evaluateCommand } from "./command-policy";
import type { CommandGuardFacts } from "./command-policy";

const makeFacts = (
  overrides: Partial<CommandGuardFacts> = {},
): CommandGuardFacts => ({
  controlMode: "aligned_halted",
  connected: [
    { path: "A", state: { state: State.HALTED } },
    { path: "B", state: { state: State.HALTED } },
  ],
  mismatchCount: 0,
  ...overrides,
});

describe("command policy", () => {
  it("timing write allows halted subset and rejects when none eligible", () => {
    const subsetFacts = makeFacts({
      controlMode: "aligned_non_halted",
      connected: [
        { path: "A", state: { state: State.HALTED } },
        { path: "B", state: { state: State.RUNNING } },
      ],
    });

    const subsetDecision = evaluateCommand(
      { type: "setTiming", divider: 1, preTrig: 2 },
      subsetFacts,
    );
    expect(subsetDecision.allowed).toBe(true);
    expect(subsetDecision.targetPaths).toEqual(["A"]);
    expect(subsetDecision.skipped).toContainEqual({
      path: "B",
      reason: "state_not_halted",
    });

    const blockedFacts = makeFacts({
      controlMode: "aligned_non_halted",
      connected: [
        { path: "A", state: { state: State.RUNNING } },
        { path: "B", state: { state: State.ACQUIRING } },
      ],
    });
    const blockedDecision = evaluateCommand(
      { type: "setTiming", divider: 1, preTrig: 2 },
      blockedFacts,
    );
    expect(blockedDecision.allowed).toBe(false);
    expect(blockedDecision.reason).toBe("no_eligible_targets");
  });

  it("trigger and rt buffer allowed non-halted but blocked in stop-only", () => {
    const nonHaltedFacts = makeFacts({
      controlMode: "aligned_non_halted",
      connected: [
        { path: "A", state: { state: State.RUNNING } },
        { path: "B", state: { state: State.ACQUIRING } },
      ],
    });

    const triggerDecision = evaluateCommand({ type: "trigger" }, nonHaltedFacts);
    expect(triggerDecision.allowed).toBe(true);

    const rtDecision = evaluateCommand(
      { type: "setRtBuffer", index: 0, value: 1.25 },
      nonHaltedFacts,
    );
    expect(rtDecision.allowed).toBe(true);

    const stopOnlyFacts = makeFacts({
      controlMode: "mismatch_stop_only",
      mismatchCount: 1,
    });
    const blockedDecision = evaluateCommand({ type: "trigger" }, stopOnlyFacts);
    expect(blockedDecision.allowed).toBe(false);
    expect(blockedDecision.reason).toBe("stop_only");
  });

  it("blocks RUNNING requests when mismatches exist", () => {
    const facts = makeFacts({
      controlMode: "mismatch_run_blocked",
      mismatchCount: 2,
    });

    const decision = evaluateCommand(
      { type: "setState", state: State.RUNNING },
      facts,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("run_blocked");
  });

  it("in stop-only mode only STOP is allowed", () => {
    const facts = makeFacts({
      controlMode: "mismatch_stop_only",
      mismatchCount: 1,
    });

    const setTriggerDecision = evaluateCommand(
      {
        type: "setTrigger",
        threshold: 1,
        channel: 0,
        mode: TriggerMode.RISING,
      },
      facts,
    );
    expect(setTriggerDecision.allowed).toBe(false);
    expect(setTriggerDecision.reason).toBe("stop_only");

    const stopDecision = evaluateCommand(
      { type: "setState", state: State.HALTED, targets: ["A"] },
      facts,
    );
    expect(stopDecision.allowed).toBe(true);
    expect(stopDecision.targetPaths).toEqual(["A", "B"]);
  });

  it("requested targets filter to connected/eligible subset", () => {
    const facts = makeFacts({
      controlMode: "aligned_non_halted",
      connected: [
        { path: "A", state: { state: State.HALTED } },
        { path: "B", state: { state: State.RUNNING } },
      ],
    });

    const decision = evaluateCommand(
      {
        type: "setTiming",
        divider: 1,
        preTrig: 1,
        targets: ["A", "Z"],
      },
      facts,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.targetPaths).toEqual(["A"]);
    expect(decision.skipped).toContainEqual({ path: "Z", reason: "not_connected" });
  });
});
