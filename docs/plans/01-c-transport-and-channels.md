# C transport + channel selection requirements (high level)

## Goals
- Survive noisy serial links; recover without power-cycle
- Deterministic framing; resync fast after garbage
- Clear versioning + capability discovery
- Backward-compat friendly; simple to implement in C on MCU
- Support channel list + channel selector (5 channels target)

## Transport framing (CRSF-inspired)
- Byte stream framing, minimal overhead
- Proposed frame: `SYNC | LEN | TYPE | PAYLOAD... | CRC`
  - `SYNC`: constant (e.g., 0xC8) to find frame start
  - `LEN`: payload length + type (define exact semantics)
  - `TYPE`: message id
  - `PAYLOAD`: variable length
  - `CRC`: CRC8 or CRC16 over `TYPE+PAYLOAD` (confirm)
- Optional: `FLAGS/SEQ` in payload for requests that need ack/retry

## C transport responsibilities
- RX parser state machine
  - states: SEEK_SYNC -> READ_LEN -> READ_TYPE -> READ_PAYLOAD -> READ_CRC
  - discard invalid LEN; clamp max len
  - CRC check; on fail, resync by scanning for next SYNC
- TX builder
  - pack frame, compute CRC, emit bytes
  - avoid dynamic alloc; fixed buffers
- Error tracking
  - counters: crc_fail, len_invalid, sync_lost, timeout
  - surface via status query (host can show device health)
- Timeouts
  - per-request timeout (host-side), optional on-device watchdog for partial frames
- Versioning
  - device exposes protocol version, capabilities bitmap
  - allow host to branch on features

## Message families (draft)
- Discovery/handshake
  - `GET_INFO`: version, device id, channel count, buffer length, label lengths
- Timing/control
  - `GET_TIMING`, `SET_TIMING`, `GET_STATE`, `SET_STATE`, `TRIGGER`
- Live data
  - `GET_FRAME` (single frame)
- Snapshot
  - `GET_SNAPSHOT_HEADER`, `GET_SNAPSHOT_DATA`
- Labels/metadata
  - `GET_CHANNEL_LABELS`, `GET_RT_LABELS`
- Channel selection
  - `GET_VAR_LIST`, `SET_CHANNEL_MAP`, `GET_CHANNEL_MAP`

## Channel list + selector logic (MCU side)
- Maintain catalog of available variables
  - array of `{id, name, ptr}`
  - `id` stable; `name` fixed length (e.g., 16)
  - host can request list in pages to limit payload
- Maintain active channel map (size = 5)
  - `channel_map[5]` holds variable ids
  - on map change: validate ids; update `frame[]` pointers
  - if invalid: reject with error code; keep old map
- Expose endpoints
  - `GET_VAR_LIST (page_idx)` -> `count + [id,name]*N`
  - `GET_CHANNEL_MAP` -> current mapping
  - `SET_CHANNEL_MAP` -> new mapping (5 ids)
- Snapshot header should include channel map + trigger info

## Noise/robustness specifics
- Make all control requests idempotent where possible
- Include request id / seq for non-idempotent actions (optional)
- Return explicit error codes
- Host should be able to re-handshake without resetting MCU


## User-programmable channel registration (note)
- Allow user code to register channels via macro(s) before `vscopeInit()`
- After `vscopeInit()`, lock registration (no new channels; prevents runtime mutation)
- Goal: users define channels/labels in their own init without editing vscope core
- Provide compile-time defaults but allow override via registration API

## Open questions
- CRC choice: CRC8 (fast) vs CRC16 (safer) vs CRSF CRC8 poly?
- Max payload size? (impacts snapshot chunking)
- Snapshot transfer: single frame vs chunked stream with seq + resume?
- Are channel labels fixed length or null-terminated?
- Do we need per-message ACKs or only for control messages?
