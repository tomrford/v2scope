# Status

- C implementation in `onboard/vscope.c` is feature-complete and frozen; treat as protocol source of truth.
- Rust/Tauri serial layer (`src-tauri/src/serial.rs`) is feature-complete; sync serialport + CRC8 framing + timeout-on-bad-frames behavior is source of truth for host I/O.
- SerialConfig in Rust uses `serialport` enums (`DataBits`, `Parity`, `StopBits`) via serde; host schema must match.
- No backward compatibility planned.
- Host-side persistent settings logic and snapshot logic are implemented in `src/lib/settings` and `src/lib/snapshots` respectively.
- Protocol and transport logic are implemented for the host in `src/lib/protocol` and `src/lib/transport` respectively.
- Remaining work is host-side only (TS/UI): handle GET_INFO endianness, sample-major snapshot chunks, (start,count) list requests with no per-entry id.
