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

  it("keeps mismatch until runtime clears it explicitly", () => {
    applyDeviceEvent({
      type: "deviceError",
      path: "A",
      error: { type: "mismatch", message: "state mismatch" },
    });
    applyDeviceEvent({
      type: "stateUpdated",
      path: "A",
      state: { state: State.HALTED },
    });

    expect(getDeviceSnapshot("A")?.mismatchError).toEqual({
      type: "mismatch",
      message: "state mismatch",
    });
  });

  it("clears mismatch + transport errors on deviceErrorCleared", () => {
    applyDeviceEvent({
      type: "deviceError",
      path: "A",
      error: { type: "mismatch", message: "timing mismatch" },
    });
    applyDeviceEvent({
      type: "deviceError",
      path: "A",
      error: { type: "device", error: SerialError.Timeout() },
    });

    applyDeviceEvent({ type: "deviceErrorCleared", path: "A" });

    expect(getDeviceSnapshot("A")?.mismatchError).toBeNull();
    expect(getDeviceSnapshot("A")?.deviceError).toBeNull();
  });
});
