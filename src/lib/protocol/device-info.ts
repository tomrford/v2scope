/**
 * Runtime device metadata populated from GET_INFO response.
 * Used to validate subsequent variable-length messages.
 */
export interface DeviceInfo {
  /** Protocol version (currently 1). */
  // TODO(vscope): C GET_INFO has no protocol_version; replace with endianness + layout update.
  protocolVersion: number;
  /** Number of recording channels (typically 5). */
  numChannels: number;
  /** Buffer size in samples. */
  bufferSize: number;
  /** ISR frequency in kHz. */
  isrKhz: number;
  /** Number of registered variables. */
  varCount: number;
  /** Number of RT buffer slots with registered names. */
  rtCount: number;
  /** Total RT buffer length (typically 16). */
  rtBufferLen: number;
  /** Device name length (typically 16). */
  nameLen: number;
  // TODO(vscope): C GET_INFO includes an endianness byte; add to DeviceInfo and decode.
  /** Device name string. */
  deviceName: string;
}
