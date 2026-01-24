export {
  settings,
  initSettings,
  updateSetting,
  getSettings,
  defaultSerialConfig,
  pollingConfig,
  snapshotConfig,
} from "./store";

export { DEFAULT_SETTINGS } from "./defaults";

export {
  SettingsSchema,
  RecentPortSchema,
  type Settings,
  type RecentPort,
  type SnapshotGcDays,
} from "./schema";
