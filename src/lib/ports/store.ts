import { writable, get } from "svelte/store";
import { z } from "zod";
import {
  SerialConfigSchema,
  type SerialConfig,
} from "../transport/serial.schema";
import { execute, selectAll } from "../db";
import { SavedPortSchema, type SavedPort } from "./schema";

const SavedPortRowSchema = z.object({
  path: z.string(),
  last_config_json: z.string().nullable().optional(),
});

const normalizePaths = (paths: string[]): string[] =>
  Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));

export const savedPorts = writable<SavedPort[]>([]);
export const activePorts = writable<string[]>([]);

const decodeLastConfig = (value?: string | null): SerialConfig | undefined => {
  if (!value) return undefined;
  try {
    const parsed = SerialConfigSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const encodeLastConfig = (value?: SerialConfig): string | null => {
  if (!value) return null;
  return JSON.stringify(value);
};

const refreshSavedPorts = async (): Promise<void> => {
  const rows = await selectAll(
    "SELECT path, last_config_json FROM saved_ports ORDER BY path ASC",
    SavedPortRowSchema,
  );
  const next = rows.map((row) => ({
    path: row.path,
    lastConfig: decodeLastConfig(row.last_config_json ?? undefined),
  }));
  savedPorts.set(next);
};

export async function initSavedPorts(): Promise<void> {
  await refreshSavedPorts();
}

export function getSavedPorts(): SavedPort[] {
  return get(savedPorts);
}

export async function upsertSavedPorts(entries: SavedPort[]): Promise<void> {
  const normalized = new Map<string, SavedPort>();
  for (const entry of entries) {
    const parsed = SavedPortSchema.safeParse(entry);
    if (!parsed.success) continue;
    normalized.set(parsed.data.path, parsed.data);
  }

  const values = Array.from(normalized.values());
  if (values.length === 0) return;

  for (const entry of values) {
    await execute(
      "INSERT INTO saved_ports (path, last_config_json) VALUES (?1, ?2) " +
        "ON CONFLICT(path) DO UPDATE SET last_config_json = excluded.last_config_json",
      [entry.path, encodeLastConfig(entry.lastConfig)],
    );
  }

  await refreshSavedPorts();
}

export async function removeSavedPorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) return;
  const placeholders = normalized.map((_, index) => `?${index + 1}`).join(", ");
  await execute(
    `DELETE FROM saved_ports WHERE path IN (${placeholders})`,
    normalized,
  );
  await refreshSavedPorts();
}

export async function migrateLegacySavedPorts(
  raw: Record<string, unknown>,
): Promise<void> {
  const fromSaved = parseLegacyEntries(raw.savedPorts);
  const fromRecent = parseLegacyEntries(raw.recentPorts);
  const merged = [...fromSaved, ...fromRecent];
  if (merged.length === 0) return;
  await upsertSavedPorts(merged);
}

const parseLegacyEntries = (value: unknown): SavedPort[] => {
  if (!Array.isArray(value)) return [];
  const entries: SavedPort[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const path = record.path;
    if (typeof path !== "string" || path.length === 0) continue;
    let lastConfig: SerialConfig | undefined;
    if ("lastConfig" in record) {
      const parsed = SerialConfigSchema.safeParse(record.lastConfig);
      if (parsed.success) lastConfig = parsed.data;
    }
    entries.push({ path, lastConfig });
  }
  return entries;
};

export function getActivePorts(): string[] {
  return get(activePorts);
}

export async function setActivePorts(paths: string[]): Promise<void> {
  activePorts.set(normalizePaths(paths));
}

export async function addActivePort(path: string): Promise<void> {
  const current = getActivePorts();
  await setActivePorts([...current, path]);
}

export async function removeActivePort(path: string): Promise<void> {
  const current = getActivePorts();
  await setActivePorts(current.filter((p) => p !== path));
}
