import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";
import { z } from "zod";

export const DB_FILENAME = "vscope.db";

let dbPromise: Promise<Database> | null = null;

export async function getDbPath(): Promise<string> {
  const dir = await appDataDir();
  return join(dir, DB_FILENAME);
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const path = await getDbPath();
      return Database.load(`sqlite:${path}`);
    })();
  }

  return dbPromise;
}

export async function execute(sql: string, params: unknown[] = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

export async function selectAll<T>(
  sql: string,
  schema: z.ZodType<T>,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(sql, params);
  return rows.map((row) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      throw new Error(`Invalid row: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export async function selectOne<T>(
  sql: string,
  schema: z.ZodType<T>,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await selectAll(sql, schema, params);
  return rows[0] ?? null;
}
