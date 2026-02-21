import { describe, expect, test } from "bun:test";
import {
  computeLiveFrameFloorHz,
  normalizeFrameHz,
} from "./live-view-limits";

describe("live view limits", () => {
  test("computes adaptive floor from window duration", () => {
    expect(computeLiveFrameFloorHz(10)).toBe(6);
    expect(computeLiveFrameFloorHz(20)).toBe(3);
    expect(computeLiveFrameFloorHz(60)).toBe(1);
  });

  test("clamps floor at maxHz", () => {
    expect(computeLiveFrameFloorHz(1, 60, 50)).toBe(50);
  });

  test("normalizes frame Hz to floor and bounds", () => {
    expect(normalizeFrameHz(1, 10, 50)).toBe(6);
    expect(normalizeFrameHz(6, 10, 50)).toBe(6);
    expect(normalizeFrameHz(80, 10, 50)).toBe(50);
  });
});
