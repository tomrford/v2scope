import { writable, derived, get } from "svelte/store";
import { z } from "zod";
import { SnapshotHeaderResponseSchema } from "../protocol/schemas";
import { getDb, selectAll, selectOne } from "../db";

const NumberArraySchema = z.array(z.number());
const StringArraySchema = z.array(z.string());
const ChannelMapSchema = z.array(z.number().int().nonnegative());

export const SnapshotMetaSchema = SnapshotHeaderResponseSchema.extend({
  id: z.number(),
  name: z.string(),
  deviceNames: z.array(z.string()).min(1),
  channelCount: z.number().int().positive(),
  sampleCount: z.number().int().positive(),
  createdAt: z.string(),
});

export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

export type SnapshotEntry = {
  meta: SnapshotMeta;
  data: Float32Array | null; // null = lazy, not yet loaded
  persisted: boolean; // true = saved to database
};
const SnapshotMetaRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  device_names_json: z.string(),
  channel_count: z.number(),
  sample_count: z.number(),
  divider: z.number(),
  pre_trig: z.number(),
  channel_map_json: z.string(),
  trigger_threshold: z.number(),
  trigger_channel: z.number(),
  trigger_mode: z.number(),
  rt_values_json: z.string(),
  created_at: z.string(),
});
const SnapshotDataRowSchema = z.object({
  data: z.unknown(),
  byte_len: z.number().int().nonnegative(),
});

const parseJson = <T>(value: string, schema: z.ZodType<T>): T => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON payload: ${String(error)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid JSON payload: ${result.error.message}`);
  }
  return result.data;
};

const decodeSnapshotMeta = (
  row: z.infer<typeof SnapshotMetaRowSchema>,
): SnapshotMeta => {
  const meta = {
    id: row.id,
    name: row.name,
    deviceNames: parseJson(row.device_names_json, StringArraySchema),
    channelCount: row.channel_count,
    sampleCount: row.sample_count,
    divider: row.divider,
    preTrig: row.pre_trig,
    channelMap: parseJson(row.channel_map_json, ChannelMapSchema),
    triggerThreshold: row.trigger_threshold,
    triggerChannel: row.trigger_channel,
    triggerMode: row.trigger_mode,
    rtValues: parseJson(row.rt_values_json, NumberArraySchema),
    createdAt: row.created_at,
  };

  const parsed = SnapshotMetaSchema.safeParse(meta);
  if (!parsed.success) {
    throw new Error(`Invalid snapshot metadata: ${parsed.error.message}`);
  }
  return parsed.data;
};

const toUint8Array = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    const maybeBuffer = (value as { buffer?: unknown }).buffer;
    if (maybeBuffer instanceof ArrayBuffer) {
      const byteOffset = (value as { byteOffset?: number }).byteOffset ?? 0;
      const byteLength = (value as { byteLength?: number }).byteLength;
      if (typeof byteLength === "number") {
        return new Uint8Array(maybeBuffer, byteOffset, byteLength);
      }
      return new Uint8Array(maybeBuffer);
    }
  }
  throw new Error("Unsupported snapshot blob type");
};

const toFloat32Array = (value: unknown, byteLen?: number): Float32Array => {
  const bytes = toUint8Array(value);
  const usableBytes =
    typeof byteLen === "number"
      ? Math.min(byteLen, bytes.byteLength)
      : bytes.byteLength;
  const length = Math.floor(usableBytes / Float32Array.BYTES_PER_ELEMENT);
  return new Float32Array(bytes.buffer, bytes.byteOffset, length);
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
  const rows = await selectAll(
    "SELECT id, name, device_names_json, channel_count, sample_count, divider, pre_trig, channel_map_json, trigger_threshold, trigger_channel, trigger_mode, rt_values_json, created_at FROM snapshot_meta ORDER BY created_at DESC",
    SnapshotMetaRowSchema,
  );
  const loaded = new Map<number, SnapshotEntry>();
  for (const row of rows) {
    const meta = decodeSnapshotMeta(row);
    loaded.set(meta.id, { meta, data: null, persisted: true });
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

  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "INSERT INTO snapshot_meta (id, name, device_names_json, channel_count, sample_count, divider, pre_trig, channel_map_json, trigger_threshold, trigger_channel, trigger_mode, rt_values_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
      [
        entry.meta.id,
        entry.meta.name,
        JSON.stringify(entry.meta.deviceNames),
        entry.meta.channelCount,
        entry.meta.sampleCount,
        entry.meta.divider,
        entry.meta.preTrig,
        JSON.stringify(entry.meta.channelMap),
        entry.meta.triggerThreshold,
        entry.meta.triggerChannel,
        entry.meta.triggerMode,
        JSON.stringify(entry.meta.rtValues),
        entry.meta.createdAt,
      ],
    );
    const bytes = new Uint8Array(
      entry.data.buffer,
      entry.data.byteOffset,
      entry.data.byteLength,
    );
    await db.execute(
      "INSERT INTO snapshot_data (snapshot_id, data, byte_len) VALUES (?1, ?2, ?3)",
      [entry.meta.id, bytes, bytes.byteLength],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }

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

  const row = await selectOne(
    "SELECT data, byte_len FROM snapshot_data WHERE snapshot_id = ?1",
    SnapshotDataRowSchema,
    [id],
  );
  if (!row) throw new Error(`Snapshot ${id} data missing`);
  const data = toFloat32Array(row.data, row.byte_len);

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
    const db = await getDb();
    await db.execute("DELETE FROM snapshot_meta WHERE id = ?1", [id]);
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
    const db = await getDb();
    await db.execute("UPDATE snapshot_meta SET name = ?1 WHERE id = ?2", [
      name,
      id,
    ]);
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
