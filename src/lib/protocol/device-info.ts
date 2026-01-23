/**
 * Runtime device metadata populated from GET_INFO response.
 * Used to validate subsequent variable-length messages.
 */
export interface DeviceInfo {
  /** Protocol version (currently 1). */
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
  /** Device name string. */
  deviceName: string;
}
