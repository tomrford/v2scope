import { derived } from "svelte/store";
import { connectedDevices } from "./device-store";
import {
  consensusMismatches,
  consensusStaticInfo,
} from "./device-consensus";
import {
  buildRuntimeMismatches,
  type RuntimeMismatch,
  type RuntimeMismatchCode,
} from "./runtime-warnings-core";

export type { RuntimeMismatch, RuntimeMismatchCode };

export const runtimeMismatches = derived(
  [connectedDevices, consensusMismatches, consensusStaticInfo],
  ([$connectedDevices, $mismatches, $staticInfo]): RuntimeMismatch[] => {
    const allPaths = $connectedDevices.map((device) => device.path);
    const staticMismatchPaths =
      $staticInfo.mismatches.size > 0 ? allPaths : [];

    return buildRuntimeMismatches({
      allPaths,
      staticMismatchPaths,
      updatedAt: Date.now(),
      mismatches: $mismatches,
    });
  },
);
