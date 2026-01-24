import * as r from "restructure";

/**
 * Pure functions for byte manipulation with selectable endianness.
 * Backed by restructure primitives for consistent packing/unpacking.
 */

const sliceBytes = (
  data: Uint8Array,
  offset: number,
  size: number,
  label: string,
): Uint8Array => {
  if (offset + size > data.length) {
    throw new RangeError(`${label}: offset ${offset} out of bounds`);
  }
  return data.subarray(offset, offset + size);
};

const writeBytes = (
  buf: Uint8Array,
  offset: number,
  data: Uint8Array,
  label: string,
): void => {
  if (offset + data.length > buf.length) {
    throw new RangeError(`${label}: offset ${offset} out of bounds`);
  }
  buf.set(data, offset);
};

// --- Read functions (from buffer at offset) ---

export const readU8 = (data: Uint8Array, offset: number): number => {
  return r.uint8.fromBuffer(sliceBytes(data, offset, 1, "readU8"));
};

export const readU16LE = (data: Uint8Array, offset: number): number => {
  return r.uint16le.fromBuffer(sliceBytes(data, offset, 2, "readU16LE"));
};

export const readU32LE = (data: Uint8Array, offset: number): number => {
  return r.uint32le.fromBuffer(sliceBytes(data, offset, 4, "readU32LE"));
};

const readU16BE = (data: Uint8Array, offset: number): number => {
  return r.uint16be.fromBuffer(sliceBytes(data, offset, 2, "readU16BE"));
};

const readU32BE = (data: Uint8Array, offset: number): number => {
  return r.uint32be.fromBuffer(sliceBytes(data, offset, 4, "readU32BE"));
};

export const readU16 = (
  data: Uint8Array,
  offset: number,
  littleEndian: boolean,
): number => {
  if (littleEndian) {
    return readU16LE(data, offset);
  }
  return readU16BE(data, offset);
};

export const readU32 = (
  data: Uint8Array,
  offset: number,
  littleEndian: boolean,
): number => {
  if (littleEndian) {
    return readU32LE(data, offset);
  }
  return readU32BE(data, offset);
};

export const readF32 = (
  data: Uint8Array,
  offset: number,
  littleEndian: boolean,
): number => {
  return littleEndian
    ? r.floatle.fromBuffer(sliceBytes(data, offset, 4, "readF32"))
    : r.floatbe.fromBuffer(sliceBytes(data, offset, 4, "readF32"));
};

export const readF32LE = (data: Uint8Array, offset: number): number =>
  readF32(data, offset, true);

export const readStringFixed = (
  data: Uint8Array,
  offset: number,
  len: number,
): string => {
  if (offset + len > data.length) {
    throw new RangeError(
      `readStringFixed: offset ${offset} + len ${len} out of bounds`,
    );
  }
  // Find null terminator or use full length
  let end = offset;
  while (end < offset + len && data[end] !== 0) {
    end++;
  }
  return new TextDecoder().decode(data.subarray(offset, end));
};

// --- Write functions (mutate buffer at offset) ---

export const writeU8 = (
  buf: Uint8Array,
  offset: number,
  value: number,
): void => {
  writeBytes(buf, offset, r.uint8.toBuffer(value & 0xff), "writeU8");
};

export const writeU16LE = (
  buf: Uint8Array,
  offset: number,
  value: number,
): void => {
  writeBytes(buf, offset, r.uint16le.toBuffer(value & 0xffff), "writeU16LE");
};

export const writeU32LE = (
  buf: Uint8Array,
  offset: number,
  value: number,
): void => {
  writeBytes(buf, offset, r.uint32le.toBuffer(value >>> 0), "writeU32LE");
};

export const writeU16 = (
  buf: Uint8Array,
  offset: number,
  value: number,
  littleEndian: boolean,
): void => {
  if (littleEndian) {
    writeU16LE(buf, offset, value);
    return;
  }
  writeBytes(buf, offset, r.uint16be.toBuffer(value & 0xffff), "writeU16");
};

export const writeU32 = (
  buf: Uint8Array,
  offset: number,
  value: number,
  littleEndian: boolean,
): void => {
  if (littleEndian) {
    writeU32LE(buf, offset, value);
    return;
  }
  writeBytes(buf, offset, r.uint32be.toBuffer(value >>> 0), "writeU32");
};

export const writeF32 = (
  buf: Uint8Array,
  offset: number,
  value: number,
  littleEndian: boolean,
): void => {
  const encoded = littleEndian
    ? r.floatle.toBuffer(value)
    : r.floatbe.toBuffer(value);
  writeBytes(buf, offset, encoded, "writeF32");
};

export const writeF32LE = (
  buf: Uint8Array,
  offset: number,
  value: number,
): void => writeF32(buf, offset, value, true);

export const writeStringFixed = (
  buf: Uint8Array,
  offset: number,
  value: string,
  len: number,
): void => {
  if (offset + len > buf.length) {
    throw new RangeError(
      `writeStringFixed: offset ${offset} + len ${len} out of bounds`,
    );
  }
  const encoded = new TextEncoder().encode(value);
  const copyLen = Math.min(encoded.length, len);
  buf.set(encoded.subarray(0, copyLen), offset);
  // Zero-fill remainder
  for (let i = copyLen; i < len; i++) {
    buf[offset + i] = 0;
  }
};
