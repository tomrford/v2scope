import { z } from "zod";
import { getDb, selectAll, selectOne } from "./index";
import { SnapshotMetaSchema, type SnapshotMeta } from "../snapshots/schema";

const NumberArraySchema = z.array(z.number());
const StringArraySchema = z.array(z.string());
const ChannelMapSchema = z.array(z.number().int().nonnegative());

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

export async function listSnapshotMeta(): Promise<SnapshotMeta[]> {
  const rows = await selectAll(
    "SELECT id, name, device_names_json, channel_count, sample_count, divider, pre_trig, channel_map_json, trigger_threshold, trigger_channel, trigger_mode, rt_values_json, created_at FROM snapshot_meta ORDER BY created_at DESC",
    SnapshotMetaRowSchema,
  );
  return rows.map((row) => decodeSnapshotMeta(row));
}

export async function saveSnapshot(
  meta: SnapshotMeta,
  data: Float32Array,
): Promise<void> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "INSERT INTO snapshot_meta (id, name, device_names_json, channel_count, sample_count, divider, pre_trig, channel_map_json, trigger_threshold, trigger_channel, trigger_mode, rt_values_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
      [
        meta.id,
        meta.name,
        JSON.stringify(meta.deviceNames),
        meta.channelCount,
        meta.sampleCount,
        meta.divider,
        meta.preTrig,
        JSON.stringify(meta.channelMap),
        meta.triggerThreshold,
        meta.triggerChannel,
        meta.triggerMode,
        JSON.stringify(meta.rtValues),
        meta.createdAt,
      ],
    );
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    await db.execute(
      "INSERT INTO snapshot_data (snapshot_id, data, byte_len) VALUES (?1, ?2, ?3)",
      [meta.id, bytes, bytes.byteLength],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function loadSnapshotData(id: number): Promise<Float32Array> {
  const row = await selectOne(
    "SELECT data, byte_len FROM snapshot_data WHERE snapshot_id = ?1",
    SnapshotDataRowSchema,
    [id],
  );
  if (!row) throw new Error(`Snapshot ${id} data missing`);
  return toFloat32Array(row.data, row.byte_len);
}

export async function deleteSnapshot(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM snapshot_meta WHERE id = ?1", [id]);
}

export async function renameSnapshot(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE snapshot_meta SET name = ?1 WHERE id = ?2", [
    name,
    id,
  ]);
}
