import { z } from "zod";
import {
  SerialConfigSchema,
  type SerialConfig,
} from "../transport/serial.schema";
import { type SavedPort } from "../ports/schema";
import { execute, selectAll } from "./index";

const SavedPortRowSchema = z.object({
  path: z.string(),
  last_config_json: z.string().nullable().optional(),
});

const decodeLastConfig = (value?: string | null): SerialConfig | undefined => {
  if (!value) return undefined;
  try {
    const parsed = SerialConfigSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const encodeLastConfig = (value?: SerialConfig): string | null => {
  if (!value) return null;
  return JSON.stringify(value);
};

export async function listSavedPorts(): Promise<SavedPort[]> {
  const rows = await selectAll(
    "SELECT path, last_config_json FROM saved_ports ORDER BY path ASC",
    SavedPortRowSchema,
  );
  return rows.map((row) => ({
    path: row.path,
    lastConfig: decodeLastConfig(row.last_config_json ?? undefined),
  }));
}

export async function upsertSavedPorts(entries: SavedPort[]): Promise<void> {
  if (entries.length === 0) return;
  for (const entry of entries) {
    await execute(
      "INSERT INTO saved_ports (path, last_config_json) VALUES (?1, ?2) " +
        "ON CONFLICT(path) DO UPDATE SET last_config_json = excluded.last_config_json",
      [entry.path, encodeLastConfig(entry.lastConfig)],
    );
  }
}

export async function removeSavedPorts(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const placeholders = paths.map((_, index) => `?${index + 1}`).join(", ");
  await execute(
    `DELETE FROM saved_ports WHERE path IN (${placeholders})`,
    paths,
  );
}
