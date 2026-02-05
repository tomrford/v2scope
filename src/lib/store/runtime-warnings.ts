import { derived } from "svelte/store";
import { connectedDevices } from "./device-store";
import { deviceConsensus } from "./device-consensus";
import {
  buildRuntimeMismatches,
  type RuntimeMismatch,
  type RuntimeMismatchCode,
} from "./runtime-warnings-core";

export type { RuntimeMismatch, RuntimeMismatchCode };

export const runtimeMismatches = derived(
  [connectedDevices, deviceConsensus],
  ([$connectedDevices, $consensus]): RuntimeMismatch[] => {
    const allPaths = $connectedDevices.map((device) => device.path);
    const staticMismatchPaths =
      $consensus.staticInfo.mismatches.size > 0 ? allPaths : [];

    return buildRuntimeMismatches({
      allPaths,
      staticMismatchPaths,
      updatedAt: Date.now(),
      mismatches: $consensus.mismatches,
    });
  },
);
