import type { SavedPort } from "$lib/ports/schema.js";
import type { PortInfo } from "$lib/transport/serial.schema.js";
import type { DeviceSession } from "$lib/store/runtime.js";

/**
 * Combined row data for the saved devices table.
 * Merges SavedPort with runtime DeviceSession info.
 */
export type SavedDeviceRow = {
  port: SavedPort;
  session: DeviceSession | null;
  isActive: boolean;
  portInfo?: PortInfo | null;
};

/**
 * Status for device display.
 */
export type DeviceStatus = "connected" | "error" | "deactivated" | "unknown";

/**
 * Row data for the available ports table (add devices modal).
 */
export type AvailablePortRow = {
  portInfo: PortInfo;
  alreadySaved: boolean;
  savedStatus?: DeviceStatus;
};

/**
 * Derive status from session data.
 */
export function getDeviceStatus(
  session: DeviceSession | null,
  isActive: boolean,
): DeviceStatus {
  if (!isActive) return "deactivated";
  if (!session) return "unknown";
  if (session.error) return "error";
  if (session.status === "connected") return "connected";
  return "unknown";
}

/**
 * Get display name for a device.
 * Uses device name from GET_INFO if connected, otherwise falls back to path.
 */
export function getDeviceDisplayName(row: SavedDeviceRow): string {
  if (row.session?.info?.deviceName) {
    return row.session.info.deviceName;
  }
  return row.port.path;
}
