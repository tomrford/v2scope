import { writable, derived, get } from "svelte/store";
import { type SnapshotMeta } from "../snapshots/schema";
import * as snapshotDb from "../db/snapshots";

export type SnapshotEntry = {
  meta: SnapshotMeta;
  data: Float32Array | null; // null = lazy, not yet loaded
  persisted: boolean; // true = saved to database
};

/**
 * Main store: all snapshots indexed by id.
 */
export const snapshots = writable<Map<number, SnapshotEntry>>(new Map());

/**
 * Initialize snapshots from the database.
 * Loads metadata, populates store with persisted: true, data: null.
 * Call once at app startup.
 */
export async function initSnapshots(): Promise<void> {
  const rows = await snapshotDb.listSnapshotMeta();
  const loaded = new Map<number, SnapshotEntry>();
  for (const row of rows) {
    loaded.set(row.id, { meta: row, data: null, persisted: true });
  }

  snapshots.set(loaded);
}

/**
 * Add a session snapshot (in-memory only, not saved yet).
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
 * Persist a session snapshot to the database.
 * Inserts metadata + blob in a transaction, flips persisted flag.
 */
export async function persistSnapshot(id: number): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry || entry.persisted || !entry.data) return;

  await snapshotDb.saveSnapshot(entry.meta, entry.data);

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

  const data = await snapshotDb.loadSnapshotData(id);

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.set(id, { ...entry, data });
    return updated;
  });

  return data;
}

/**
 * Delete a snapshot from store and database (if persisted).
 */
export async function deleteSnapshot(id: number): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry) return;

  if (entry.persisted) {
    await snapshotDb.deleteSnapshot(id);
  }

  snapshots.update((m) => {
    const updated = new Map(m);
    updated.delete(id);
    return updated;
  });
}

/**
 * Rename a snapshot (update meta.name).
 * If persisted, updates the database row.
 */
export async function renameSnapshot(id: number, name: string): Promise<void> {
  const entry = get(snapshots).get(id);
  if (!entry) return;

  const updatedMeta = { ...entry.meta, name };

  if (entry.persisted) {
    await snapshotDb.renameSnapshot(id, name);
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
 * Session snapshots (not yet saved).
 */
export const sessionSnapshots = derived(snapshots, ($s) =>
  Array.from($s.values()).filter((e) => !e.persisted),
);

/**
 * Persisted snapshots (saved to database).
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
