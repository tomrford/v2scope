# VScope Code Review & Implementation Tasks

Items identified during code review of Rust and C implementations.

## Rust Issues (`src-tauri/src/serial.rs`)

### Lock poisoning handling
- **Issue**: Using `.expect()` on lock acquisition (lines 57, 63, 68)
- **Risk**: Panic if previous holder panicked
- **Decision**: Acceptable for now if code "can't" panic; note but don't chase immediately
- [ ] Document assumption that code paths don't panic

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
