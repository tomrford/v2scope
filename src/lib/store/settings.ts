import { LazyStore } from "@tauri-apps/plugin-store";
import { writable, derived, get } from "svelte/store";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { SettingsSchema, type Settings } from "../settings/schema";
import { migrateLegacySavedPorts } from "./ports";

const STORE_FILE = "settings.json";
const SETTINGS_RECOVERY_PENDING_KEY = "settingsRecoveryPending";
const SETTINGS_RECOVERY_NOTICE =
  "Settings file was invalid and has been reset to defaults. Open Settings and change/save once to acknowledge.";
let tauriStore: LazyStore | null = null;
let settingsUnsubscribe: (() => void) | null = null;

// Svelte store - always has valid settings (defaults merged with persisted)
export const settings = writable<Settings>(DEFAULT_SETTINGS);
export const settingsRecoveryPending = writable(false);
export const settingsRecoveryWarning = writable<string | null>(null);

const createStore = (createNew = false): LazyStore =>
  new LazyStore(STORE_FILE, {
    autoSave: 300, // 300ms debounce
    defaults: {
      settings: DEFAULT_SETTINGS,
      [SETTINGS_RECOVERY_PENDING_KEY]: false,
    },
    createNew,
  });

const recoverSettingsStore = async (): Promise<void> => {
  settings.set(DEFAULT_SETTINGS);
  settingsRecoveryPending.set(true);
  settingsRecoveryWarning.set(SETTINGS_RECOVERY_NOTICE);

  tauriStore = createStore(true);
  await tauriStore.set("settings", DEFAULT_SETTINGS);
  await tauriStore.set(SETTINGS_RECOVERY_PENDING_KEY, true);
  await tauriStore.save();
};

/**
 * Initialize settings from disk and set up persistence.
 * Call once at app startup.
 */
export async function initSettings(): Promise<void> {
  tauriStore = createStore(false);
  let stored: Record<string, unknown> | undefined;

  try {
    stored = await tauriStore.get<Record<string, unknown>>("settings");
  } catch {
    await recoverSettingsStore();
    stored = undefined;
  }

  if (stored) {
    // Merge stored with defaults (handles new settings gracefully)
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    const parsed = SettingsSchema.safeParse(merged);
    if (!parsed.success) {
      await recoverSettingsStore();
      stored = undefined;
    } else {
      settings.set(parsed.data);
      await migrateLegacySavedPorts(stored);
    }
  }

  const pending =
    (await tauriStore.get<boolean>(SETTINGS_RECOVERY_PENDING_KEY)) ?? false;
  settingsRecoveryPending.set(pending);
  if (pending) {
    settingsRecoveryWarning.set(SETTINGS_RECOVERY_NOTICE);
  }

  settingsUnsubscribe?.();
  let firstEmission = true;
  settingsUnsubscribe = settings.subscribe(async (value) => {
    await tauriStore?.set("settings", value);
    if (firstEmission) {
      firstEmission = false;
      return;
    }

    if (get(settingsRecoveryPending)) {
      settingsRecoveryPending.set(false);
      settingsRecoveryWarning.set(null);
      await tauriStore?.set(SETTINGS_RECOVERY_PENDING_KEY, false);
    }
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
