import {
  readFile,
  writeFile,
  readDir,
  mkdir,
  exists,
  remove,
} from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/api/path";
import { writable, derived, get } from "svelte/store";
import {
  SnapshotMetaSchema,
  type SnapshotMeta,
  type SnapshotEntry,
} from "./schema";

const SNAPSHOTS_DIR = "snapshots";
const base = { baseDir: BaseDirectory.AppData };

/**
 * Main store: all snapshots indexed by id.
 */
export const snapshots = writable<Map<number, SnapshotEntry>>(new Map());

/**
 * Initialize snapshots from disk.
 * Scans the snapshots directory, loads metadata, populates store with persisted: true, data: null.
 * Call once at app startup.
 */
export async function initSnapshots(): Promise<void> {
  const dirExists = await exists(SNAPSHOTS_DIR, base);
  if (!dirExists) {
    await mkdir(SNAPSHOTS_DIR, base);
    return;
  }

  const entries = await readDir(SNAPSHOTS_DIR, base);
  const loaded = new Map<number, SnapshotEntry>();

  for (const entry of entries) {
    if (!entry.isDirectory) continue;

    const dirName = entry.name;
    if (!dirName || !/^[0-9]+$/.test(dirName)) continue;

    try {
      const metaPath = `${SNAPSHOTS_DIR}/${dirName}/metadata.json`;
      if (!(await exists(metaPath, base))) continue;
      const metaBytes = await readFile(metaPath, base);
      const metaRaw = JSON.parse(new TextDecoder().decode(metaBytes));
      const parsed = SnapshotMetaSchema.safeParse(metaRaw);

      if (parsed.success) {
        loaded.set(parsed.data.id, {
          meta: parsed.data,
          data: null,
          persisted: true,
        });
      }
    } catch {
      // Skip invalid directories
    }
  }

  snapshots.set(loaded);
}

/**
 * Add a session snapshot (in-memory only, not saved to disk yet).
 */
export function addSessionSnapshot(
  meta: SnapshotMeta,
  data: Float32Array,
): void {
  snapshots.update((m) => {
    const updated = new Map(m);
    updated.set(meta.id, { meta, data, persisted: false });
    return updated;
  });
}

/**
 * Persist a session snapshot to disk.
 * Creates directory, writes metadata.json and data.bin, flips persisted flag.
 */
export async function persistSnapshot(id: number): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry || entry.persisted || !entry.data) return;

  const dir = `${SNAPSHOTS_DIR}/${id}`;
  await mkdir(dir, { ...base, recursive: true });

  const metaJson = JSON.stringify(entry.meta, null, 2);
  await writeFile(
    `${dir}/metadata.json`,
    new TextEncoder().encode(metaJson),
    base,
  );
  await writeFile(
    `${dir}/data.bin`,
    new Uint8Array(
      entry.data.buffer,
      entry.data.byteOffset,
      entry.data.byteLength,
    ),
    base,
  );

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.set(id, { ...entry, persisted: true });
    return updated;
  });
}

/**
 * Lazy-load data for a persisted snapshot.
 * Returns the Float32Array and updates the store entry.
 */
export async function loadSnapshotData(id: number): Promise<Float32Array> {
  const entry = get(snapshots).get(id);
  if (!entry) throw new Error(`Snapshot ${id} not found`);
  if (entry.data) return entry.data;

  const bytes = await readFile(`${SNAPSHOTS_DIR}/${id}/data.bin`, base);
  const data = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.set(id, { ...entry, data });
    return updated;
  });

  return data;
}

/**
 * Delete a snapshot from store and disk (if persisted).
 */
export async function deleteSnapshot(id: number): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry) return;

  if (entry.persisted) {
    await remove(`${SNAPSHOTS_DIR}/${id}`, { ...base, recursive: true });
  }

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.delete(id);
    return updated;
  });
}

/**
 * Rename a snapshot (update meta.name).
 * If persisted, rewrites metadata.json on disk.
 */
export async function renameSnapshot(id: number, name: string): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry) return;

  const updatedMeta = { ...entry.meta, name };

  if (entry.persisted) {
    const metaJson = JSON.stringify(updatedMeta, null, 2);
    await writeFile(
      `${SNAPSHOTS_DIR}/${id}/metadata.json`,
      new TextEncoder().encode(metaJson),
      base,
    );
  }

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.set(id, { ...entry, meta: updatedMeta });
    return updated;
  });
}

/**
 * Get a snapshot entry by id (synchronous).
 */
export function getSnapshot(id: number): SnapshotEntry | undefined {
  return get(snapshots).get(id);
}

// Derived stores for UI convenience

/**
 * Session snapshots (not yet saved to disk).
 */
export const sessionSnapshots = derived(snapshots, ($s) =>
  Array.from($s.values()).filter((e) => !e.persisted),
);

/**
 * Persisted snapshots (saved to disk).
 */
export const persistedSnapshots = derived(snapshots, ($s) =>
  Array.from($s.values()).filter((e) => e.persisted),
);

/**
 * All snapshots as array, sorted by id (newest first).
 */
export const allSnapshots = derived(snapshots, ($s) =>
  Array.from($s.values()).sort((a, b) => b.meta.id - a.meta.id),
);
