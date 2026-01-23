/**
 * Pure functions for little-endian byte manipulation.
 * No dependencies - works with standard Uint8Array.
 */

// --- Read functions (from buffer at offset) ---

export const readU8 = (data: Uint8Array, offset: number): number => {
  if (offset >= data.length) throw new RangeError(`readU8: offset ${offset} out of bounds`);
  return data[offset];
};

export const readU16LE = (data: Uint8Array, offset: number): number => {
  if (offset + 2 > data.length) throw new RangeError(`readU16LE: offset ${offset} out of bounds`);
  return data[offset] | (data[offset + 1] << 8);
};

export const readU32LE = (data: Uint8Array, offset: number): number => {
  if (offset + 4 > data.length) throw new RangeError(`readU32LE: offset ${offset} out of bounds`);
  // Use >>> 0 on entire result to force unsigned interpretation
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  );
};

// Float view for reading/writing IEEE 754 floats
const floatView = new DataView(new ArrayBuffer(4));

export const readF32LE = (data: Uint8Array, offset: number): number => {
  if (offset + 4 > data.length) throw new RangeError(`readF32LE: offset ${offset} out of bounds`);
  floatView.setUint8(0, data[offset]);
  floatView.setUint8(1, data[offset + 1]);
  floatView.setUint8(2, data[offset + 2]);
  floatView.setUint8(3, data[offset + 3]);
  return floatView.getFloat32(0, true);
};

export const readStringFixed = (data: Uint8Array, offset: number, len: number): string => {
  if (offset + len > data.length) {
    throw new RangeError(`readStringFixed: offset ${offset} + len ${len} out of bounds`);
  }
  // Find null terminator or use full length
  let end = offset;
  while (end < offset + len && data[end] !== 0) {
    end++;
  }
  return new TextDecoder().decode(data.subarray(offset, end));
};

// --- Write functions (mutate buffer at offset) ---

export const writeU8 = (buf: Uint8Array, offset: number, value: number): void => {
  if (offset >= buf.length) throw new RangeError(`writeU8: offset ${offset} out of bounds`);
  buf[offset] = value & 0xff;
};

export const writeU16LE = (buf: Uint8Array, offset: number, value: number): void => {
  if (offset + 2 > buf.length) throw new RangeError(`writeU16LE: offset ${offset} out of bounds`);
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
};

export const writeU32LE = (buf: Uint8Array, offset: number, value: number): void => {
  if (offset + 4 > buf.length) throw new RangeError(`writeU32LE: offset ${offset} out of bounds`);
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
};

export const writeF32LE = (buf: Uint8Array, offset: number, value: number): void => {
  if (offset + 4 > buf.length) throw new RangeError(`writeF32LE: offset ${offset} out of bounds`);
  floatView.setFloat32(0, value, true);
  buf[offset] = floatView.getUint8(0);
  buf[offset + 1] = floatView.getUint8(1);
  buf[offset + 2] = floatView.getUint8(2);
  buf[offset + 3] = floatView.getUint8(3);
};

export const writeStringFixed = (
  buf: Uint8Array,
  offset: number,
  value: string,
  len: number
): void => {
  if (offset + len > buf.length) {
    throw new RangeError(`writeStringFixed: offset ${offset} + len ${len} out of bounds`);
  }
  const encoded = new TextEncoder().encode(value);
  const copyLen = Math.min(encoded.length, len);
  buf.set(encoded.subarray(0, copyLen), offset);
  // Zero-fill remainder
  for (let i = copyLen; i < len; i++) {
    buf[offset + i] = 0;
  }
};
