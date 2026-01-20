# VScope Code Review & Implementation Tasks

Items identified during code review of Rust and C implementations.

## Protocol Changes (Breaking)

### Revert LEN field to 1 byte
- **Current**: LEN is `u16` (2 bytes), allows up to 65535 byte payloads
- **Target**: LEN is `u8` (1 byte), max 255 bytes after LEN field
- **Impact**: Max payload = 255 - 2 (type + crc) = 253 bytes
- **Calculations**:
  - 63 fp32s per chunk (252 bytes)
  - 158 chunks for 1000-sample download (1000 / 63 × 5 channels)
  - 15 labels per message (15 × 16 = 240 bytes)

**Files to update**:
- [ ] `onboard/vscope.h`: Change `VSCOPE_MAX_PAYLOAD` from 512 to 253
- [ ] `onboard/vscope.c`: Update `vscope_send_frame()` to use 1-byte LEN
- [ ] `onboard/vscope.c`: Update `vscopeFeed()` RX state machine (remove VS_RX_LEN_HI state)
- [ ] `src-tauri/src/serial.rs`: Update `build_frame()` and `read_frame()` for 1-byte LEN
- [ ] `onboard/PROTOCOL.md`: Update framing diagram and descriptions

### CRC scope verification
- **Status**: ✅ Correct - CRC covers TYPE + PAYLOAD only (matches CRSF spec)
- CRSF spec (line 34, 254-256): "CRC covers TYPE + PAYLOAD only (not SYNC or LEN)"
- Both Rust and C implement this correctly

## Rust Issues (`src-tauri/src/serial.rs`)

### Add hard timeout for frame reading
- **Issue**: `read_frame()` loops indefinitely searching for valid frame
- **Risk**: Can hang if device goes silent mid-frame or sends garbage
- **Solution**: Add configurable timeout (default 100ms) after mutex lock/transmit
- **Note**: This should be a tunable parameter stored in config file
- [ ] Add timeout parameter to `send_request()` or make it configurable
- [ ] Implement max iteration count or deadline in `read_frame()` loop

### Lock poisoning handling
- **Issue**: Using `.expect()` on lock acquisition (lines 57, 63, 68)
- **Risk**: Panic if previous holder panicked
- **Decision**: Acceptable for now if code "can't" panic; note but don't chase immediately
- [ ] Document assumption that code paths don't panic

### Device disconnect detection
- **Issue**: No distinct error type for disconnection vs protocol failure
- **Observation**: Disconnect manifests as timeout → retry → timeout → assume disconnect
- **Action**: Effect layer will need to distinguish timeout patterns from error responses
- [ ] Document disconnect detection strategy for Effect layer

## C Issues (`onboard/vscope.c`)

### divider_ticks overflow potential
- **Location**: Line 777-781
- **Issue**: `divider_ticks` is `uint16_t` but `vscope.divider` is `uint32_t`
- **Risk**: If divider > 65535, comparison never true after overflow
- [ ] Change `divider_ticks` to `uint32_t`, OR
- [ ] Add validation to clamp divider to UINT16_MAX

### GET_SNAPSHOT_DATA bounds check
- **Location**: Line 383-388
- **Issue**: No check for `start_sample + requested_count > buffer_size`
- **Risk**: Reads valid buffer indices (modulo) but semantically past snapshot boundary
- [ ] Add bounds validation: `start_sample + requested_count <= buffer_size`

### RT labels response size
- **Location**: Lines 471-485
- **Issue**: Returns all 16 slots even if only `rt_count` are registered (zeroed padding)
- **Impact**: Wastes bandwidth; client must use `rt_count` from GET_INFO
- **Decision**: Acceptable, but document that client should respect `rt_count`

### last_delta static variable
- **Location**: Line 752
- **Observation**: `static float last_delta` persists across calls
- **Decision**: Correct behavior - measures delta across all states; no change needed

### Snapshot validity behavior
- **Observation**: `snapshot_valid = false` on RUNNING, `true` only after ACQUIRING completes
- **Decision**: Correct behavior; requesting header during ACQUIRING returns NOT_READY as intended

## Configuration & Persistence

### Local config file needed
Application needs persistent config file for:
- [ ] Frame timeout setting (default 100ms, tunable)
- [ ] Serial port history (previously used ports)
- [ ] Last-used serial settings per port (baud, data bits, parity, stop bits)
- [ ] Live buffer size (default TBD)
- [ ] Polling rates (state @20Hz, frame @10Hz, both configurable)

**Format**: JSON or TOML in standard config directory
**Location**: Use Tauri's app data directory

## State Management

### Settings lock during RUNNING/ACQUIRING
- **Issue**: Trigger/timing settings can be changed while device is running
- **Action**: Add UI locks (disable controls) when device state is RUNNING or ACQUIRING
- [ ] Document which settings should be locked
- [ ] Implement in Effect service layer (reject SET commands in wrong state?)
- [ ] Implement in UI (disable inputs based on state)

**Settings to lock**:
- SET_TIMING (divider, pre_trig)
- SET_TRIGGER (threshold, channel, mode)
- SET_CHANNEL_MAP (channel assignments)

## Notes for Later

- Snapshot validity timing is correct (NOT_READY during ACQUIRING is intentional)
- Protocol is pre-release; no backward-compat effort needed yet
- Multi-byte values use little-endian throughout (except CRSF reference which uses big-endian for some fields - we diverge intentionally)
