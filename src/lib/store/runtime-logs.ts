import { writable } from "svelte/store";

export type RuntimeLogEntry = {
  at: number;
  message: string;
};

const MAX_RUNTIME_LOG_LINES = 200;

export const runtimeLogs = writable<RuntimeLogEntry[]>([]);

export function appendRuntimeLog(entry: RuntimeLogEntry): void {
  runtimeLogs.update((current) => {
    const next = [...current, entry];
    if (next.length <= MAX_RUNTIME_LOG_LINES) return next;
    return next.slice(next.length - MAX_RUNTIME_LOG_LINES);
  });
}

export function clearRuntimeLogs(): void {
  runtimeLogs.set([]);
}
