import { Effect } from "effect";
import type { SerialConfig } from "../transport/serial.schema";
import type { PortInfo } from "../transport/serial.schema";
import { getSettings, setActivePorts, updateSetting } from "../settings/store";
import { DeviceService } from "./DeviceService";
import type { RuntimeCommand } from "./RuntimeService";
import { enqueueRuntimeCommand, runRuntimeEffect } from "./store";

const normalizePaths = (paths: string[]): string[] =>
  Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));

const resolveSerialConfig = (path: string): SerialConfig => {
  const settings = getSettings();
  const saved = settings.savedPorts.find((entry) => entry.path === path);
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
  const settings = getSettings();
  await setActivePorts([...settings.activePorts, ...normalized]);

  const existing = new Map(
    settings.savedPorts.map((entry) => [entry.path, entry]),
  );
  for (const path of normalized) {
    if (!existing.has(path)) {
      existing.set(path, {
        path,
        lastConfig: resolveSerialConfig(path),
      });
    }
  }

  await updateSetting("savedPorts", Array.from(existing.values()));
}

export async function removeSaved(paths: string[]): Promise<void> {
  const normalized = new Set(normalizePaths(paths));
  if (normalized.size === 0) return;
  await Promise.all(
    Array.from(normalized.values()).map((path) => enqueueDisconnect(path)),
  );

  const settings = getSettings();
  await updateSetting(
    "savedPorts",
    settings.savedPorts.filter((entry) => !normalized.has(entry.path)),
  );
  await setActivePorts(
    settings.activePorts.filter((path) => !normalized.has(path)),
  );
}

export async function activatePorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  await Promise.all(normalized.map((path) => enqueueConnect(path)));
}

export async function deactivatePorts(paths: string[]): Promise<void> {
  const normalized = normalizePaths(paths);
  await Promise.all(normalized.map((path) => enqueueDisconnect(path)));
  const current = getSettings().activePorts;
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
