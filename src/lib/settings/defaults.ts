import type { Settings } from "./schema";

export const DEFAULT_SETTINGS: Settings = {
  statePollingHz: 20,
  framePollingHz: 10,
  frameTimeoutMs: 100,
  crcRetryAttempts: 3,
  liveBufferDurationS: 10,
  defaultSerialConfig: {
    baudRate: 115200,
    dataBits: "Eight",
    parity: "None",
    stopBits: "One",
    readTimeoutMs: 100,
  },
  snapshotAutoSave: false,
  snapshotGcDays: "never",
};
