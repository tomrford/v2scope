import { describe, expect, it } from "bun:test";
import { parseSerialError, SerialError } from "./errors";

describe("parseSerialError", () => {
  it("parses PortNotFound from Rust JSON", () => {
    const err = parseSerialError({
      type: "PortNotFound",
      data: { path: "/dev/ttyUSB0" },
    });
    expect(err._tag).toBe("PortNotFound");
    expect((err as { path: string }).path).toBe("/dev/ttyUSB0");
  });

  it("parses PortBusy from Rust JSON", () => {
    const err = parseSerialError({
      type: "PortBusy",
      data: { path: "/dev/ttyUSB0" },
    });
    expect(err._tag).toBe("PortBusy");
    expect((err as { path: string }).path).toBe("/dev/ttyUSB0");
  });

  it("parses InvalidHandle from Rust JSON", () => {
    const err = parseSerialError({
      type: "InvalidHandle",
      data: { handle_id: 42 },
    });
    expect(err._tag).toBe("InvalidHandle");
    expect((err as { handleId: number }).handleId).toBe(42);
  });

  it("parses Timeout from Rust JSON", () => {
    const err = parseSerialError({ type: "Timeout" });
    expect(err._tag).toBe("Timeout");
  });

  it("parses IoError from Rust JSON", () => {
    const err = parseSerialError({
      type: "IoError",
      data: { message: "connection reset" },
    });
    expect(err._tag).toBe("IoError");
    expect((err as { message: string }).message).toBe("connection reset");
  });

  it("parses InvalidConfig from Rust JSON", () => {
    const err = parseSerialError({
      type: "InvalidConfig",
      data: { message: "bad baud rate" },
    });
    expect(err._tag).toBe("InvalidConfig");
    expect((err as { message: string }).message).toBe("bad baud rate");
  });

  it("parses PayloadTooLarge from Rust JSON", () => {
    const err = parseSerialError({ type: "PayloadTooLarge" });
    expect(err._tag).toBe("PayloadTooLarge");
  });

  it("falls back to IoError for plain string", () => {
    const err = parseSerialError("something went wrong");
    expect(err._tag).toBe("IoError");
    expect((err as { message: string }).message).toBe("something went wrong");
  });

  it("falls back to IoError for Error instance", () => {
    const err = parseSerialError(new Error("oops"));
    expect(err._tag).toBe("IoError");
    expect((err as { message: string }).message).toBe("oops");
  });

  it("falls back to IoError for unknown object", () => {
    const err = parseSerialError({ foo: "bar" });
    expect(err._tag).toBe("IoError");
    expect((err as { message: string }).message).toBe("unknown error");
  });

  it("handles missing data gracefully", () => {
    const err = parseSerialError({ type: "PortNotFound" });
    expect(err._tag).toBe("PortNotFound");
    expect((err as { path: string }).path).toBe("unknown");
  });
});

describe("SerialError constructors", () => {
  it("creates PortNotFound", () => {
    const err = SerialError.PortNotFound({ path: "/dev/tty0" });
    expect(err._tag).toBe("PortNotFound");
    expect(err.path).toBe("/dev/tty0");
  });

  it("creates Timeout", () => {
    const err = SerialError.Timeout();
    expect(err._tag).toBe("Timeout");
  });
});
