import { beforeEach, describe, expect, it } from "bun:test";
import { SerialError } from "../errors";
import { State } from "../protocol";
import {
  applyDeviceEvent,
  getDeviceSnapshot,
  resetDeviceStore,
} from "./device-store";

describe("device store error lifecycle", () => {
  beforeEach(() => {
    resetDeviceStore();
  });

  it("stores transport errors from runtime", () => {
    applyDeviceEvent({
      type: "deviceError",
      path: "A",
      error: { type: "device", error: SerialError.Timeout() },
    });
    expect(getDeviceSnapshot("A")?.deviceError).toEqual({
      type: "device",
      error: SerialError.Timeout(),
    });
  });

  it("clears transport errors on successful updates", () => {
    applyDeviceEvent({
      type: "deviceError",
      path: "A",
      error: { type: "device", error: SerialError.Timeout() },
    });
    applyDeviceEvent({
      type: "stateUpdated",
      path: "A",
      state: { state: State.HALTED },
    });
    expect(getDeviceSnapshot("A")?.deviceError).toBeNull();
  });
});
