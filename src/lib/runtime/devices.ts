import { Effect } from "effect";
import type { SerialConfig } from "../transport/serial.schema";
import type { PortInfo } from "../transport/serial.schema";
import { getSettings } from "../store/settings";
import {
  getActivePorts,
  getSavedPorts,
  removeSavedPorts,
  setActivePorts,
  upsertSavedPorts,
} from "../store/ports";
import { DeviceService } from "./DeviceService";
import type { RuntimeCommand } from "./RuntimeService";
import { enqueueRuntimeCommand, runRuntimeEffect } from "../store/runtime";

const normalizePaths = (paths: string[]): string[] =>
  Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));

const resolveSerialConfig = (path: string): SerialConfig => {
  const settings = getSettings();
  const saved = getSavedPorts().find((entry) => entry.path === path);
  return saved?.lastConfig ?? settings.defaultSerialConfig;
};

const enqueueConnect = async (path: string): Promise<void> =>
  enqueueRuntimeCommand({
    type: "connect",
    path,
    config: resolveSerialConfig(path),
  });

const enqueueDisconnect = async (path: string): Promise<void> =>
  enqueueRuntimeCommand({ type: "disconnect", path });

export async function listPorts(): Promise<PortInfo[]> {
  return runRuntimeEffect(
    Effect.flatMap(DeviceService, (service) => service.listPorts()),
  );
}

export async function addToSaved(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) return;
  const existing = new Map(getSavedPorts().map((entry) => [entry.path, entry]));
  for (const path of normalized) {
    if (!existing.has(path)) {
      existing.set(path, { path });
    }
  }

  await upsertSavedPorts(Array.from(existing.values()));
  await setActivePorts([...getActivePorts(), ...normalized]);
}

export async function removeSaved(paths: string[]): Promise<void> {
  const normalized = new Set(normalizePaths(paths));
  if (normalized.size === 0) return;
  await Promise.all(
    Array.from(normalized.values()).map((path) => enqueueDisconnect(path)),
  );

  await removeSavedPorts(Array.from(normalized.values()));
  await setActivePorts(
    getActivePorts().filter((path) => !normalized.has(path)),
  );
}

export async function activatePorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) return;
  await setActivePorts([...getActivePorts(), ...normalized]);
  await Promise.all(normalized.map((path) => enqueueConnect(path)));
}

export async function deactivatePorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  await Promise.all(normalized.map((path) => enqueueDisconnect(path)));
  const current = getActivePorts();
  await setActivePorts(current.filter((path) => !normalized.includes(path)));
}

export async function resyncPorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  await Promise.all(
    normalized.map(async (path) => {
      await enqueueDisconnect(path);
      await enqueueConnect(path);
    }),
  );
}

export async function enqueueCommands(
  commands: RuntimeCommand[],
): Promise<void> {
  await Promise.all(commands.map((command) => enqueueRuntimeCommand(command)));
}
