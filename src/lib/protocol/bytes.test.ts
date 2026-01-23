import { describe, expect, it } from "bun:test";
import {
  readU8,
  readU16LE,
  readU32LE,
  readF32LE,
  readStringFixed,
  writeU8,
  writeU16LE,
  writeU32LE,
  writeF32LE,
  writeStringFixed,
} from "./bytes";

describe("readU8", () => {
  it("reads single byte", () => {
    const data = new Uint8Array([0x00, 0x42, 0xff]);
    expect(readU8(data, 0)).toBe(0x00);
    expect(readU8(data, 1)).toBe(0x42);
    expect(readU8(data, 2)).toBe(0xff);
  });

  it("throws on out of bounds", () => {
    const data = new Uint8Array([0x42]);
    expect(() => readU8(data, 1)).toThrow(RangeError);
  });
});

describe("readU16LE", () => {
  it("reads little-endian u16", () => {
    // 0x1234 in LE = [0x34, 0x12]
    const data = new Uint8Array([0x34, 0x12]);
    expect(readU16LE(data, 0)).toBe(0x1234);
  });

  it("reads at offset", () => {
    const data = new Uint8Array([0x00, 0xff, 0xfe]);
    expect(readU16LE(data, 1)).toBe(0xfeff);
  });

  it("throws on out of bounds", () => {
    const data = new Uint8Array([0x42]);
    expect(() => readU16LE(data, 0)).toThrow(RangeError);
  });
});

describe("readU32LE", () => {
  it("reads little-endian u32", () => {
    // 0x12345678 in LE = [0x78, 0x56, 0x34, 0x12]
    const data = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
    expect(readU32LE(data, 0)).toBe(0x12345678);
  });

  it("reads max value correctly", () => {
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    expect(readU32LE(data, 0)).toBe(0xffffffff);
  });

  it("throws on out of bounds", () => {
    const data = new Uint8Array([0x00, 0x00, 0x00]);
    expect(() => readU32LE(data, 0)).toThrow(RangeError);
  });
});

describe("readF32LE", () => {
  it("reads IEEE 754 float", () => {
    // 1.0f in LE = [0x00, 0x00, 0x80, 0x3f]
    const data = new Uint8Array([0x00, 0x00, 0x80, 0x3f]);
    expect(readF32LE(data, 0)).toBe(1.0);
  });

  it("reads negative float", () => {
    // -1.0f in LE = [0x00, 0x00, 0x80, 0xbf]
    const data = new Uint8Array([0x00, 0x00, 0x80, 0xbf]);
    expect(readF32LE(data, 0)).toBe(-1.0);
  });

  it("reads at offset", () => {
    const data = new Uint8Array([0xff, 0x00, 0x00, 0x80, 0x3f]);
    expect(readF32LE(data, 1)).toBe(1.0);
  });

  it("throws on out of bounds", () => {
    const data = new Uint8Array([0x00, 0x00, 0x00]);
    expect(() => readF32LE(data, 0)).toThrow(RangeError);
  });
});

describe("readStringFixed", () => {
  it("reads null-terminated string", () => {
    const data = new Uint8Array([0x48, 0x69, 0x00, 0x00]); // "Hi\0\0"
    expect(readStringFixed(data, 0, 4)).toBe("Hi");
  });

  it("reads full-length string without null", () => {
    const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    expect(readStringFixed(data, 0, 5)).toBe("Hello");
  });

  it("reads at offset", () => {
    const data = new Uint8Array([0x00, 0x41, 0x42, 0x00]); // "\0AB\0"
    expect(readStringFixed(data, 1, 3)).toBe("AB");
  });

  it("throws on out of bounds", () => {
    const data = new Uint8Array([0x41, 0x42]);
    expect(() => readStringFixed(data, 0, 3)).toThrow(RangeError);
  });
});

describe("writeU8", () => {
  it("writes single byte", () => {
    const buf = new Uint8Array(3);
    writeU8(buf, 1, 0x42);
    expect(buf[1]).toBe(0x42);
  });

  it("masks to 8 bits", () => {
    const buf = new Uint8Array(1);
    writeU8(buf, 0, 0x1ff);
    expect(buf[0]).toBe(0xff);
  });

  it("throws on out of bounds", () => {
    const buf = new Uint8Array(1);
    expect(() => writeU8(buf, 1, 0)).toThrow(RangeError);
  });
});

describe("writeU16LE", () => {
  it("writes little-endian u16", () => {
    const buf = new Uint8Array(2);
    writeU16LE(buf, 0, 0x1234);
    expect(buf[0]).toBe(0x34);
    expect(buf[1]).toBe(0x12);
  });

  it("round-trips with readU16LE", () => {
    const buf = new Uint8Array(2);
    writeU16LE(buf, 0, 0xabcd);
    expect(readU16LE(buf, 0)).toBe(0xabcd);
  });

  it("throws on out of bounds", () => {
    const buf = new Uint8Array(1);
    expect(() => writeU16LE(buf, 0, 0)).toThrow(RangeError);
  });
});

describe("writeU32LE", () => {
  it("writes little-endian u32", () => {
    const buf = new Uint8Array(4);
    writeU32LE(buf, 0, 0x12345678);
    expect(buf[0]).toBe(0x78);
    expect(buf[1]).toBe(0x56);
    expect(buf[2]).toBe(0x34);
    expect(buf[3]).toBe(0x12);
  });

  it("round-trips with readU32LE", () => {
    const buf = new Uint8Array(4);
    writeU32LE(buf, 0, 0xdeadbeef);
    expect(readU32LE(buf, 0)).toBe(0xdeadbeef);
  });

  it("handles max value", () => {
    const buf = new Uint8Array(4);
    writeU32LE(buf, 0, 0xffffffff);
    expect(readU32LE(buf, 0)).toBe(0xffffffff);
  });

  it("throws on out of bounds", () => {
    const buf = new Uint8Array(3);
    expect(() => writeU32LE(buf, 0, 0)).toThrow(RangeError);
  });
});

describe("writeF32LE", () => {
  it("writes IEEE 754 float", () => {
    const buf = new Uint8Array(4);
    writeF32LE(buf, 0, 1.0);
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0x00);
    expect(buf[2]).toBe(0x80);
    expect(buf[3]).toBe(0x3f);
  });

  it("round-trips with readF32LE", () => {
    const buf = new Uint8Array(4);
    writeF32LE(buf, 0, 3.14159);
    expect(readF32LE(buf, 0)).toBeCloseTo(3.14159, 5);
  });

  it("round-trips negative values", () => {
    const buf = new Uint8Array(4);
    writeF32LE(buf, 0, -42.5);
    expect(readF32LE(buf, 0)).toBe(-42.5);
  });

  it("throws on out of bounds", () => {
    const buf = new Uint8Array(3);
    expect(() => writeF32LE(buf, 0, 0)).toThrow(RangeError);
  });
});

describe("writeStringFixed", () => {
  it("writes string with null padding", () => {
    const buf = new Uint8Array(6);
    writeStringFixed(buf, 0, "Hi", 6);
    expect(buf[0]).toBe(0x48); // 'H'
    expect(buf[1]).toBe(0x69); // 'i'
    expect(buf[2]).toBe(0x00);
    expect(buf[3]).toBe(0x00);
    expect(buf[4]).toBe(0x00);
    expect(buf[5]).toBe(0x00);
  });

  it("truncates long strings", () => {
    const buf = new Uint8Array(3);
    writeStringFixed(buf, 0, "Hello", 3);
    expect(buf[0]).toBe(0x48); // 'H'
    expect(buf[1]).toBe(0x65); // 'e'
    expect(buf[2]).toBe(0x6c); // 'l'
  });

  it("round-trips with readStringFixed", () => {
    const buf = new Uint8Array(16);
    writeStringFixed(buf, 0, "TestDevice", 16);
    expect(readStringFixed(buf, 0, 16)).toBe("TestDevice");
  });

  it("throws on out of bounds", () => {
    const buf = new Uint8Array(2);
    expect(() => writeStringFixed(buf, 0, "Hi", 3)).toThrow(RangeError);
  });
});
