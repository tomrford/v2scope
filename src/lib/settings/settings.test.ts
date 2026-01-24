import { describe, expect, test } from "bun:test";
import { SettingsSchema } from "./schema";
import { DEFAULT_SETTINGS } from "./defaults";

describe("settings", () => {
  test("DEFAULT_SETTINGS conforms to schema", () => {
    const result = SettingsSchema.safeParse(DEFAULT_SETTINGS);
    expect(result.success).toBe(true);
  });

  test("DEFAULT_SETTINGS fails if required field missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { statePollingHz: _, ...incomplete } = DEFAULT_SETTINGS;
    const result = SettingsSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
