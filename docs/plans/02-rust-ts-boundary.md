# Rust <-> TypeScript boundary (Tauri + Svelte + effect)

## Goal
- Keep Rust small, mostly sync; avoid complex async Rust
- Use TS/effect runtime for orchestration, retries, polling, backoff
- Still put low-level, error-prone bits in Rust (serial + framing)

## Proposed split (lean Rust)
Rust (core helper layer):
- Serial port discovery + open/close
- Transport framing + CRC + parser
- Single request/response helpers
- Snapshot cache read/write (metadata + binary)
- Optional lightweight transforms (downsample, scale, merge)

TypeScript (effect runtime):
- Device lifecycle orchestration
- Polling loops (state + frame)
- Retry/backoff policies
- UI state, multi-device coordination, error surfacing
- Scheduling: run/stop/trigger, snapshot flow

## Rationale
- Framing + CRC in TS is fragile; keep in Rust
- Polling + UI orchestration is easier in TS/effect
- Avoid Rust async by using blocking threads or minimal async wrappers

## Rust API surface (suggested)
- `list_ports(filters) -> [{id, path, vid, pid, name}]`
- `open_device(path, serial_cfg) -> device_handle`
- `close_device(handle)`
- `send_request(handle, bytes) -> bytes` (single frame)
- `read_frame(handle) -> bytes` (one framed message)
- `cache_snapshot(meta, data) -> snapshot_id`
- `read_snapshot_meta(id)` / `read_snapshot_data(id)`

## TS/effect orchestration pattern
- Effect service per device
  - maintains health state + error counters
  - handles reconnect, backoff, drop/degrade
- Pollers
  - `get_state` @ 20Hz
  - `get_frame` @ 10Hz
  - snapshot flow on demand
- All operations go through Rust single-request API

## Streaming option (if needed)
- Rust background thread reads frames, emits Tauri events
- TS subscribes, applies routing + rate limiting
- Still avoids async Rust by using threads + channels

## Tradeoffs
- TS polling implies more crossings; OK at low rates
- Large snapshot payloads: better to store in Rust + return path
- If performance tight, move frame polling into Rust thread

## Open questions
- Preferred transport for binary payloads: base64 vs raw bytes?
- Snapshot size targets? (influences boundary)
- Need shared memory or memory-mapped files?
- How many devices concurrently? (per-device thread count)
- Do we want Rust to own device retry/reconnect instead?
