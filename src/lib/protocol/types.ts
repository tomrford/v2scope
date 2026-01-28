/**
 * Protocol enums matching C code and protocol spec.
 */

/** Message types for vscope protocol. */
export enum MessageType {
  GET_INFO = 0x01,
  GET_TIMING = 0x02,
  SET_TIMING = 0x03,
  GET_STATE = 0x04,
  SET_STATE = 0x05,
  TRIGGER = 0x06,
  GET_FRAME = 0x07,
  GET_SNAPSHOT_HEADER = 0x08,
  GET_SNAPSHOT_DATA = 0x09,
  GET_VAR_LIST = 0x0a,
  GET_CHANNEL_MAP = 0x0b,
  SET_CHANNEL_MAP = 0x0c,
  GET_RT_LABELS = 0x0d,
  GET_RT_BUFFER = 0x0e,
  SET_RT_BUFFER = 0x0f,
  GET_TRIGGER = 0x10,
  SET_TRIGGER = 0x11,
  ERROR = 0xff,
}

/** Device state values. */
export enum State {
  HALTED = 0,
  RUNNING = 1,
  ACQUIRING = 2,
  MISCONFIGURED = 3,
}

/** Trigger mode values. */
export enum TriggerMode {
  DISABLED = 0,
  RISING = 1,
  FALLING = 2,
  BOTH = 3,
}

/** Error codes returned by device. */
export enum ErrorCode {
  BAD_LEN = 0x01,
  BAD_PARAM = 0x02,
  RANGE = 0x04,
  NOT_READY = 0x05,
}

/** Endianness values reported by GET_INFO. */
export enum Endianness {
  Little = 0,
  Big = 1,
}
