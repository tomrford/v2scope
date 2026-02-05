# Status

- C implementation in `onboard/vscope.c` is protocol source of truth; frozen.
- Rust/Tauri serial layer in `src-tauri/src/serial.rs` is source of truth for host I/O.
- Host protocol/transport implemented in `src/lib/protocol` + `src/lib/transport`.
- Settings persisted via Tauri store in `src/lib/store/settings`.
- Snapshots persisted via `src/lib/db/snapshots` + `src/lib/store/snapshots`.
- Remaining work: see `docs/todos.md`.
