# CRSF Protocol Reference

Reference based on ExpressLRS, Betaflight, and INAV implementations.

## Frame Structure

```
Standard Frame:
┌─────────┬────────────┬──────┬──────────┬─────┐
│ SYNC    │ LEN        │ TYPE │ PAYLOAD  │ CRC │
│ 0xC8    │ payload+2  │ 1B   │ 0-62B    │ 1B  │
└─────────┴────────────┴──────┴──────────┴─────┘

Extended Frame (addressed):
┌─────────┬────────────┬──────┬──────┬────────┬──────────┬─────┐
│ SYNC    │ LEN        │ TYPE │ DEST │ ORIGIN │ PAYLOAD  │ CRC │
│ 0xC8    │ payload+4  │ 1B   │ 1B   │ 1B     │ 0-58B    │ 1B  │
└─────────┴────────────┴──────┴──────┴────────┴──────────┴─────┘
```

- **SYNC**: Always `0xC8`
- **LEN**: Bytes after LEN field (includes TYPE + PAYLOAD + CRC)
- **Max frame**: 64 bytes total

## Serial Config

- **Baud**: 420,000 bps
- **Format**: 8N1
- **Duplex**: Half-duplex
- **Frame rate**: ~150Hz (6.67ms intervals)

## CRC-8 DVB-S2

Polynomial `0xD5`, init `0x00`. CRC covers TYPE + PAYLOAD only (not SYNC or LEN).

```c
uint8_t crc8_dvb_s2(uint8_t crc, uint8_t byte) {
    crc ^= byte;
    for (int i = 0; i < 8; i++) {
        crc = (crc & 0x80) ? (crc << 1) ^ 0xD5 : crc << 1;
    }
    return crc;
}
```

## Common Message Types

| Type | Name | Payload | Description |
|------|------|---------|-------------|
| 0x02 | GPS | 15B | lat, lon, alt, speed, heading, sats |
| 0x08 | Battery | 8B | voltage, current, capacity, remaining |
| 0x14 | Link Stats | 10B | RSSI, LQ, SNR, antenna, RF mode |
| 0x16 | RC Channels | 22B | 16 channels × 11-bit packed |
| 0x1E | Attitude | 6B | pitch, roll, yaw |
| 0x21 | Flight Mode | 16B | mode string |
| 0x28 | Device Ping | ext | discovery |
| 0x29 | Device Info | ext | serial, version, params |
| 0x7A | MSP Request | ext | MSP v2 tunneling |
| 0x7B | MSP Response | ext | MSP v2 response |

## Device Addresses

| Addr | Device |
|------|--------|
| 0x00 | Broadcast |
| 0xC8 | Flight Controller |
| 0xEA | Radio Transmitter |
| 0xEC | CRSF Receiver |
| 0xEE | CRSF Transmitter |

Note: 0xC8 is both SYNC byte and FC address—context disambiguates.

## RC Channels (0x16)

16 channels packed as 11-bit values (22 bytes total).

```c
// Value range: 172-1811 → 987-2012µs
#define CRSF_CHANNEL_MIN  172   // -100%
#define CRSF_CHANNEL_MID  992   // center
#define CRSF_CHANNEL_MAX  1811  // +100%
```

## Link Stats (0x14)

```c
struct LinkStats {
    uint8_t uplink_rssi_1;      // dBm × -1
    uint8_t uplink_rssi_2;      // dBm × -1
    uint8_t uplink_lq;          // 0-100%
    int8_t  uplink_snr;         // dB
    uint8_t active_antenna;     // 0 or 1
    uint8_t rf_mode;            // rate index
    uint8_t tx_power;           // power index
    uint8_t downlink_rssi;      // dBm × -1
    uint8_t downlink_lq;        // 0-100%
    int8_t  downlink_snr;       // dB
};
```

## Battery (0x08)

```c
struct Battery {
    uint16_t voltage;    // mV/100, big-endian
    uint16_t current;    // mA/100, big-endian
    uint8_t  capacity[3]; // mAh, 24-bit big-endian
    uint8_t  remaining;  // 0-100%
};
```

## Notes

- Multi-byte values are **big-endian**
- Extended types (0x28+) include DEST/ORIGIN addressing
- Frame timeout: ~1750µs → reset parser on timeout

---

## RX State Machine

3-state FSM for byte-level parsing:

```
IDLE ──[0xC8]──► RECEIVING_LENGTH ──[valid len]──► RECEIVING_DATA ──[all bytes]──► CRC check
  ▲                    │                                │                              │
  │                    │ [invalid len]                  │ [timeout]                    │
  └────────────────────┴────────────────────────────────┴──────────────────────────────┘
```

```c
switch (state) {
case IDLE:
    if (byte == CRSF_SYNC_BYTE) {
        state = RECEIVING_LENGTH;
    }
    break;
case RECEIVING_LENGTH:
    if (byte < 3 || byte > 62) {
        state = IDLE;  // invalid length, reject
    } else {
        frame_len = byte;
        state = RECEIVING_DATA;
    }
    break;
case RECEIVING_DATA:
    buffer[idx++] = byte;
    if (idx == frame_len) {
        if (crc_valid()) process_frame();
        state = IDLE;
    }
    break;
}
```

## Timeout & Resync

Key robustness mechanism: if no complete frame within timeout, reset parser.

```c
#define CRSF_FRAME_TIMEOUT_US  1750  // max time to complete a frame

if (micros() - frame_start > CRSF_FRAME_TIMEOUT_US) {
    // Incomplete frame, likely corruption—reset and wait for new sync
    if (frame_position > 0) error_count++;
    frame_position = 0;
    state = IDLE;
}
```

**Benefits:**
- Self-healing: recovers from mid-frame corruption
- No explicit resync byte sequence needed
- Simple to implement

## Error Recovery (CRSF V3)

Consecutive CRC failures trigger baud rate fallback:

```c
#define ERROR_THRESHOLD 3

if (!crc_valid()) {
    if (++error_count >= ERROR_THRESHOLD) {
        set_default_baud();  // fall back to 420k
        error_count = 0;
    }
} else {
    error_count = 0;  // reset on success
}
```

## Half-Duplex Timing

CRSF is half-duplex—TX and RX share a wire. Must avoid collisions.

```
Master TX Frame      Safe TX Window           Next Master Frame
├─ 0µs               ├─ 1750µs                ├─ 6667µs (150Hz)
│                    │                        │
│ ◄─ RX receiving ─► │ ◄─── TX allowed ────►  │
│    ~1750µs         │      ~3170µs           │
│                    │                        │
└────────────────────┴────────────────────────┘
```

```c
void maybe_send_telemetry(void) {
    uint32_t since_frame_start = micros() - last_frame_start;
    
    // Don't TX during RX window (first 1750µs)
    if (since_frame_start < CRSF_FRAME_TIMEOUT_US) return;
    
    // Don't TX too close to next frame (last 1750µs of cycle)
    if (since_frame_start > (FRAME_INTERVAL - CRSF_FRAME_TIMEOUT_US)) return;
    
    // Safe to transmit
    send_pending_telemetry();
}
```

## Telemetry Scheduling

Round-robin scheduler distributes telemetry frames evenly:

```c
#define TELEMETRY_CYCLE_MS  100  // 10Hz overall rate

static uint8_t schedule[] = {
    FRAME_ATTITUDE,
    FRAME_BATTERY,
    FRAME_GPS,
    FRAME_FLIGHT_MODE
};
static uint8_t schedule_idx = 0;

void telemetry_tick(void) {
    // Check for priority responses first (MSP, device info)
    if (pending_msp_response) {
        send_msp_response();
        return;
    }
    
    // Regular scheduled telemetry
    uint32_t slot_interval = TELEMETRY_CYCLE_MS / ARRAY_LEN(schedule);
    if (millis() - last_telemetry > slot_interval) {
        send_frame(schedule[schedule_idx]);
        schedule_idx = (schedule_idx + 1) % ARRAY_LEN(schedule);
        last_telemetry = millis();
    }
}
```

## CRC Scope

CRC covers TYPE + PAYLOAD only (not SYNC or LEN):

```c
uint8_t compute_crc(uint8_t *frame, uint8_t len) {
    uint8_t crc = 0;
    crc = crc8_dvb_s2(crc, frame[2]);  // TYPE byte
    for (int i = 0; i < len - 2; i++) {
        crc = crc8_dvb_s2(crc, frame[3 + i]);  // PAYLOAD bytes
    }
    return crc;
}
```

## Timing Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CRSF_BAUDRATE` | 420,000 | bps |
| `CRSF_FRAME_TIMEOUT_US` | 1,750 | max frame TX time |
| `CRSF_FRAME_INTERVAL_US` | 6,667 | 150Hz master rate |
| `CRSF_LINK_TIMEOUT_US` | 250,000 | link quality timeout |
| Byte time | ~24µs | at 420k baud |
| Max frame time | ~1,520µs | 64 bytes |

## Robustness Summary

| Feature | Mechanism |
|---------|-----------|
| Self-healing resync | Timeout resets to IDLE |
| CRC validation | DVB-S2 detects corruption |
| Length validation | Reject 0-2 or >62 |
| Baud fallback | 3 consecutive errors → default baud |
| Half-duplex guards | Timing windows prevent collision |
| Priority responses | MSP/device info bypass schedule |
