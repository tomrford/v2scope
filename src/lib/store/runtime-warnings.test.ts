import { describe, expect, it } from "bun:test";
import { buildRuntimeMismatches } from "./runtime-warnings-core";

const baseFacts = {
  allPaths: ["A", "B"],
  staticMismatchPaths: ["A", "B"],
  updatedAt: 123,
  mismatches: {
    staticMismatch: false,
    stateMismatch: false,
    timingMismatch: false,
    triggerMismatch: false,
    channelMapMismatch: false,
    rtMismatch: false,
    catalogMismatch: false,
  },
};

describe("runtime warning mismatches", () => {
  it("emits state mismatch as stop_only", () => {
    const mismatches = buildRuntimeMismatches({
      ...baseFacts,
      mismatches: {
        ...baseFacts.mismatches,
        stateMismatch: true,
      },
    });

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      code: "state_mismatch",
      blocking: "stop_only",
      paths: ["A", "B"],
    });
  });

  it("emits run-blocking mismatches for timing/rt/catalog", () => {
    const mismatches = buildRuntimeMismatches({
      ...baseFacts,
      mismatches: {
        ...baseFacts.mismatches,
        timingMismatch: true,
        rtMismatch: true,
        catalogMismatch: true,
      },
    });

    expect(mismatches.map((entry) => entry.code).sort()).toEqual([
      "catalog_mismatch",
      "rt_mismatch",
      "timing_mismatch",
    ]);
    expect(mismatches.every((entry) => entry.blocking === "run")).toBe(true);
  });

  it("dedupes repeated path sets and clears when aligned", () => {
    const first = buildRuntimeMismatches({
      ...baseFacts,
      updatedAt: 500,
      mismatches: {
        ...baseFacts.mismatches,
        staticMismatch: true,
      },
    });
    expect(first).toHaveLength(1);
    expect(first[0].code).toBe("static_mismatch");

    const second = buildRuntimeMismatches({
      ...baseFacts,
      updatedAt: 501,
      mismatches: {
        ...baseFacts.mismatches,
      },
    });
    expect(second).toEqual([]);
  });
});
