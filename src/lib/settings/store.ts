import { LazyStore } from "@tauri-apps/plugin-store";
import { writable, derived, get } from "svelte/store";
import { DEFAULT_SETTINGS } from "./defaults";
import { SettingsSchema, type Settings } from "./schema";

const STORE_FILE = "settings.json";
let tauriStore: LazyStore | null = null;

// Svelte store - always has valid settings (defaults merged with persisted)
export const settings = writable<Settings>(DEFAULT_SETTINGS);

/**
 * Initialize settings from disk and set up persistence.
 * Call once at app startup.
 */
export async function initSettings(): Promise<void> {
  tauriStore = new LazyStore(STORE_FILE, {
    autoSave: 300, // 300ms debounce
    defaults: { settings: DEFAULT_SETTINGS },
  });

  const stored = await tauriStore.get<Partial<Settings>>("settings");
  if (stored) {
    // Merge stored with defaults (handles new settings gracefully)
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    const parsed = SettingsSchema.safeParse(merged);
    if (parsed.success) {
      settings.set(parsed.data);
    }
  }

  // Subscribe to changes and persist
  settings.subscribe(async (value) => {
    await tauriStore?.set("settings", value);
  });
}

/**
 * Update a single setting key.
 */
export async function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  settings.update((s) => ({ ...s, [key]: value }));
}

/**
 * Get current settings value synchronously.
 */
export function getSettings(): Settings {
  return get(settings);
}

// Derived stores for common access patterns
export const defaultSerialConfig = derived(
  settings,
  (s) => s.defaultSerialConfig,
);
export const pollingConfig = derived(settings, (s) => ({
  stateHz: s.statePollingHz,
  frameHz: s.framePollingHz,
  frameTimeoutMs: s.frameTimeoutMs,
  crcRetryAttempts: s.crcRetryAttempts,
}));
export const snapshotConfig = derived(settings, (s) => ({
  autoSave: s.snapshotAutoSave,
  gcDays: s.snapshotGcDays,
}));

export const activePorts = derived(settings, (s) => s.activePorts);

const normalizePorts = (paths: string[]): string[] =>
  Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));

export async function setActivePorts(paths: string[]): Promise<void> {
  await updateSetting("activePorts", normalizePorts(paths));
}

export async function addActivePort(path: string): Promise<void> {
  const current = get(settings).activePorts;
  await updateSetting("activePorts", normalizePorts([...current, path]));
}

export async function removeActivePort(path: string): Promise<void> {
  const current = get(settings).activePorts;
  await updateSetting(
    "activePorts",
    normalizePorts(current.filter((p) => p !== path)),
  );
}
