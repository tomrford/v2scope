import { LazyStore } from "@tauri-apps/plugin-store";
import { writable, derived, get } from "svelte/store";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { SettingsSchema, type Settings } from "../settings/schema";
import { migrateLegacySavedPorts } from "./ports";

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

  const stored = await tauriStore.get<Record<string, unknown>>("settings");
  if (stored) {
    await migrateLegacySavedPorts(stored);
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
