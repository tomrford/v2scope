# Status

- C implementation in `onboard/vscope.c` is feature-complete and frozen; treat as protocol source of truth.
- Rust/Tauri serial layer (`src-tauri/src/serial.rs`) is feature-complete; sync serialport + CRC8 framing + timeout-on-bad-frames behavior is source of truth for host I/O.
- SerialConfig in Rust uses `serialport` enums (`DataBits`, `Parity`, `StopBits`) via serde; host schema must match.
- No backward compatibility planned.
- Remaining work is host-side only (TS/UI): handle GET_INFO endianness, sample-major snapshot chunks, (start,count) list requests with no per-entry id, and align serial config enum encoding.
