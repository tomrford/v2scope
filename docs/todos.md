# VScope Code Review & Implementation Tasks

Items identified during code review of Rust and C implementations.

## Rust Issues (`src-tauri/src/serial.rs`)

### Lock poisoning handling

- **Issue**: Using `.expect()` on lock acquisition in `src-tauri/src/serial.rs`
- **Risk**: Panic if previous holder panicked
- **Decision**: Acceptable for now if code "can't" panic; note but don't chase immediately
- [ ] Document assumption that code paths don't panic

### SerialConfig schema alignment

- **Issue**: Rust expects `serialport` enums via serde (`DataBits`, `Parity`, `StopBits`)
- **Risk**: TS/UI config still uses string enums ("5"/"6"/"7"/"8", "none"/"odd"/"even")
- [ ] Align TS schema + UI values with Rust enum encoding

## Configuration & Persistence

### Local config file needed

Application needs persistent config file for:

- [ ] Frame timeout setting (tunable, minimum 50ms enforced by UI)
- [ ] Serial port history (previously used ports)
- [ ] Last-used serial settings per port (baud, data bits, parity, stop bits)
- [ ] Live buffer size (default TBD)
- [ ] Polling rates (state @20Hz, frame @10Hz, both configurable)

**Format**: JSON or TOML in standard config directory
**Location**: Use Tauri's app data directory

## UI/Runtime

### App bootstrap error handling

- **Issue**: app stays blank if settings init throws
- **Action**: use try/finally and render error component on failure
- [ ] Add bootstrap error UI for settings init

### Serial port filtering ownership

- **Decision**: list all ports in Tauri; UI filters visibility only
- **Action**: add simple UI table filter later (name/vid/pid)

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
- Multi-byte values use native endianness; host must honor GET_INFO endianness byte
