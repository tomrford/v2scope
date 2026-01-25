export {
  settings,
  initSettings,
  updateSetting,
  getSettings,
  defaultSerialConfig,
  pollingConfig,
  snapshotConfig,
  activePorts,
  setActivePorts,
  addActivePort,
  removeActivePort,
} from "./store";

export { DEFAULT_SETTINGS } from "./defaults";

export {
  SettingsSchema,
  type Settings,
  SavedPortSchema,
  type SavedPort,
  type SnapshotGcDays,
} from "./schema";
