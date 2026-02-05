import { derived, writable } from "svelte/store";
import type { PortInfo } from "../transport/serial.schema";
import { listPorts } from "../runtime/devices";
import { activePorts, savedPorts } from "./ports";
import { deviceStore } from "./device-store";
import { runtimeMismatches } from "./runtime-warnings";
import type {
  AvailablePortRow,
  SavedDeviceRow,
} from "../components/devices-table/types";

type AvailablePortsStatus = "idle" | "loading" | "ready" | "error";

export type AvailablePortsState = {
  status: AvailablePortsStatus;
  ports: PortInfo[];
  error: string | null;
  updatedAt: number | null;
};

const dedupePorts = (ports: PortInfo[]): PortInfo[] => {
  const map = new Map<string, PortInfo>();
  for (const port of ports) {
    if (!port.path) continue;
    if (!map.has(port.path)) {
      map.set(port.path, port);
    }
  }
  return Array.from(map.values());
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

export const availablePortsState = writable<AvailablePortsState>({
  status: "idle",
  ports: [],
  error: null,
  updatedAt: null,
});

export const selectedAvailablePaths = writable<string[]>([]);

export const savedDeviceRows = derived(
  [savedPorts, activePorts, deviceStore, availablePortsState, runtimeMismatches],
  ([saved, active, devices, available, mismatches]): SavedDeviceRow[] => {
    const activeSet = new Set(active);
    const portInfoMap = new Map(
      available.ports.map((port) => [port.path, port]),
    );

    const mismatchByPath = new Map<string, (typeof mismatches)[number]>();
    for (const mismatch of mismatches) {
      for (const path of mismatch.paths) {
        if (!mismatchByPath.has(path)) {
          mismatchByPath.set(path, mismatch);
        }
      }
    }

    return saved.map((port) => ({
      port,
      session: devices.get(port.path) ?? null,
      mismatch: mismatchByPath.get(port.path) ?? null,
      isActive: activeSet.has(port.path),
      portInfo: portInfoMap.get(port.path) ?? null,
    }));
  },
);

export const availablePortRows = derived(
  [availablePortsState, savedDeviceRows],
  ([available, saved]): AvailablePortRow[] => {
    const savedPaths = new Set(saved.map((row) => row.port.path));
    return available.ports
      .filter((portInfo) => !savedPaths.has(portInfo.path))
      .map((portInfo) => ({ portInfo }));
  },
);

export async function refreshAvailablePorts(): Promise<void> {
  availablePortsState.update((state) => ({
    ...state,
    status: "loading",
    error: null,
  }));

  try {
    const ports = await listPorts();
    const normalized = dedupePorts(ports);
    availablePortsState.set({
      status: "ready",
      ports: normalized,
      error: null,
      updatedAt: Date.now(),
    });
  } catch (error) {
    availablePortsState.set({
      status: "error",
      ports: [],
      error: toErrorMessage(error),
      updatedAt: Date.now(),
    });
  }
}

export function clearAvailableSelection(): void {
  selectedAvailablePaths.set([]);
}
