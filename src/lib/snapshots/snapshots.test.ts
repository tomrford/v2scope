import { describe, expect, test } from "bun:test";
import { SnapshotMetaSchema, type SnapshotMeta } from "./store";
import { TriggerMode } from "../protocol/types";

const validMeta: SnapshotMeta = {
  id: 1706123456789,
  name: "Test Snapshot",
  deviceNames: ["motor_controller"],
  channelCount: 5,
  sampleCount: 1024,
  channelMap: [0, 1, 2, 3, 4],
  divider: 10,
  preTrig: 256,
  triggerThreshold: 0.5,
  triggerChannel: 1,
  triggerMode: TriggerMode.RISING,
  rtValues: [1.2, 3.4, 5.6],
  createdAt: "2024-01-24T12:34:56.789Z",
};

describe("SnapshotMetaSchema", () => {
  test("accepts valid metadata", () => {
    const result = SnapshotMetaSchema.safeParse(validMeta);
    expect(result.success).toBe(true);
  });

  test("rejects metadata missing required field", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deviceNames: _, ...incomplete } = validMeta;
    const result = SnapshotMetaSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  test("rejects empty deviceNames array", () => {
    const invalid = { ...validMeta, deviceNames: [] };
    const result = SnapshotMetaSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid channelCount (zero)", () => {
    const invalid = { ...validMeta, channelCount: 0 };
    const result = SnapshotMetaSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects negative preTrig", () => {
    const invalid = { ...validMeta, preTrig: -1 };
    const result = SnapshotMetaSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid triggerMode", () => {
    const invalid = { ...validMeta, triggerMode: 9 };
    const result = SnapshotMetaSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
