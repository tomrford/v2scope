export type RuntimeMismatchCode =
  | "static_mismatch"
  | "state_mismatch"
  | "timing_mismatch"
  | "trigger_mismatch"
  | "channel_map_mismatch"
  | "rt_mismatch"
  | "catalog_mismatch";

export type RuntimeMismatch = {
  code: RuntimeMismatchCode;
  paths: string[];
  message: string;
  updatedAt: number;
  blocking: "run" | "stop_only";
};

export type RuntimeMismatchFacts = {
  allPaths: string[];
  staticMismatchPaths: string[];
  updatedAt: number;
  mismatches: {
    staticMismatch: boolean;
    stateMismatch: boolean;
    timingMismatch: boolean;
    triggerMismatch: boolean;
    channelMapMismatch: boolean;
    rtMismatch: boolean;
    catalogMismatch: boolean;
  };
};

const sortedUnique = (paths: string[]): string[] =>
  Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right));

const mismatchKey = (code: RuntimeMismatchCode, paths: string[]): string =>
  `${code}:${paths.join(",")}`;

const buildMismatch = (
  code: RuntimeMismatchCode,
  paths: string[],
  message: string,
  blocking: "run" | "stop_only",
  updatedAt: number,
): RuntimeMismatch | null => {
  const normalizedPaths = sortedUnique(paths);
  if (normalizedPaths.length === 0) return null;
  return {
    code,
    paths: normalizedPaths,
    message,
    blocking,
    updatedAt,
  };
};

const withDedupe = (entries: Array<RuntimeMismatch | null>): RuntimeMismatch[] => {
  const deduped = new Map<string, RuntimeMismatch>();
  for (const entry of entries) {
    if (!entry) continue;
    deduped.set(mismatchKey(entry.code, entry.paths), entry);
  }
  return Array.from(deduped.values());
};

export const buildRuntimeMismatches = (facts: RuntimeMismatchFacts): RuntimeMismatch[] =>
  withDedupe([
    facts.mismatches.staticMismatch
      ? buildMismatch(
          "static_mismatch",
          facts.staticMismatchPaths,
          "Connected devices do not share static device info.",
          "run",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.stateMismatch
      ? buildMismatch(
          "state_mismatch",
          facts.allPaths,
          "Connected devices are in different run states.",
          "stop_only",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.timingMismatch
      ? buildMismatch(
          "timing_mismatch",
          facts.allPaths,
          "Connected devices do not share timing parameters.",
          "run",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.triggerMismatch
      ? buildMismatch(
          "trigger_mismatch",
          facts.allPaths,
          "Connected devices do not share trigger settings.",
          "run",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.channelMapMismatch
      ? buildMismatch(
          "channel_map_mismatch",
          facts.allPaths,
          "Connected devices do not share channel mappings.",
          "run",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.rtMismatch
      ? buildMismatch(
          "rt_mismatch",
          facts.allPaths,
          "Connected devices do not share RT buffer values.",
          "run",
          facts.updatedAt,
        )
      : null,
    facts.mismatches.catalogMismatch
      ? buildMismatch(
          "catalog_mismatch",
          facts.allPaths,
          "Connected devices do not share variable/RT catalogs.",
          "run",
          facts.updatedAt,
        )
      : null,
  ]);
