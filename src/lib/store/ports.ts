import { writable, get } from "svelte/store";
import {
  SerialConfigSchema,
  type SerialConfig,
} from "../transport/serial.schema";
import { SavedPortSchema, type SavedPort } from "../ports/schema";
import {
  listSavedPorts,
  upsertSavedPorts as upsertSavedPortsDb,
  removeSavedPorts as removeSavedPortsDb,
} from "../db/ports";

const normalizePaths = (paths: string[]): string[] =>
  Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));

export const savedPorts = writable<SavedPort[]>([]);
export const activePorts = writable<string[]>([]);

const refreshSavedPorts = async (): Promise<void> => {
  savedPorts.set(await listSavedPorts());
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

  await upsertSavedPortsDb(values);
  await refreshSavedPorts();
}

export async function removeSavedPorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) return;
  await removeSavedPortsDb(normalized);
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
