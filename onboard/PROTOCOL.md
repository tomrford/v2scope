# VScope Serial Protocol (CRSF-inspired)

## Framing

```
┌─────────┬─────┬──────┬───────────┬─────┐
│ SYNC    │ LEN │ TYPE │ PAYLOAD   │ CRC │
│ 0xC8    │ N+2 │ 1B   │ 0-252B    │ 1B  │
└─────────┴─────┴──────┴───────────┴─────┘
```

- **SYNC**: `0xC8`
- **LEN**: 1 byte, count of bytes after LEN (TYPE + PAYLOAD + CRC), range 2-254
- **CRC**: CRC8 DVB-S2 (poly `0xD5`), computed over TYPE + PAYLOAD
- **Endianness**: device-native; GET_INFO includes an endianness byte (host must swap if needed)
- **Max payload**: 252 bytes (254 - TYPE - CRC)
- **Max frame size**: 256 bytes (SYNC + LEN + 254)

**Practical limits**:

- 63 float32 values per payload (252 bytes)
- 12 samples per snapshot chunk when `VSCOPE_NUM_CHANNELS = 5`
- 15 variable labels per GET_VAR_LIST page

## Response format

All successful responses use the **same TYPE** as the request and include only the response data (no status byte).

Errors are returned as a dedicated error frame:

- **TYPE**: `0xFF`
- **Payload**: `u8 error_code`

Notes:

- Error frames are sent **only** for requests that pass framing + CRC checks.
- If LEN/CRC is invalid, the device drops the frame and sends no response.
- Hosts should treat timeouts/IO errors (including disconnects) as transport issues; `0xFF` indicates a logical/parameter error.

## Message Types

### `0x01` GET_INFO

**Request:** empty payload  
**Response data:**

- `u8` channel_count
- `u16` buffer_size
- `u16` isr_khz (nearest kHz)
- `u8` var_count
- `u8` rt_count
- `u8` rt_buffer_len
- `u8` name_len
- `u8` endianness (`0` little, `1` big)
- `char[name_len]` device_name (fixed length)

### `0x02` GET_TIMING

**Request:** empty payload  
**Response data:** `u32 divider`, `u32 pre_trig`

### `0x03` SET_TIMING

**Request payload:** `u32 divider`, `u32 pre_trig`  
**Response data:** `u32 divider`, `u32 pre_trig`

### `0x04` GET_STATE

**Request:** empty payload  
**Response data:** `u8 state`

### `0x05` SET_STATE

**Request payload:** `u8 state`  
**Response data:** `u8 state` (current state readback)

Valid states:

- `0` HALTED
- `1` RUNNING
- `2` ACQUIRING
- `3` MISCONFIGURED (read-only)

### `0x06` TRIGGER

**Request:** empty payload  
**Response:** empty payload

### `0x07` GET_FRAME

**Request:** empty payload  
**Response data:** `float[VSCOPE_NUM_CHANNELS]` (mapped channels)

### `0x08` GET_SNAPSHOT_HEADER

**Request:** empty payload  
**Response data:**

- `u8[VSCOPE_NUM_CHANNELS]` channel_map (var IDs)
- `u32` divider
- `u32` pre_trig
- `float` trigger_threshold
- `u8` trigger_channel
- `u8` trigger_mode
- `float[rt_count]` rt_values (count from `GET_INFO`)

If no valid snapshot is available, respond with error code `NOT_READY`.

### `0x09` GET_SNAPSHOT_DATA

**Request payload:** `u16 start_sample`, `u8 sample_count`  
**Response data:** `float[sample_count * VSCOPE_NUM_CHANNELS]`

Notes:

- `start_sample` is relative to the device's internal trigger index (`first_element`)
- Host controls `sample_count` to adapt to noisy links
- Max sample_count = `VSCOPE_MAX_PAYLOAD / (VSCOPE_NUM_CHANNELS * 4)`
- `buffer_size` for total samples comes from `GET_INFO`
- If no valid snapshot is available, respond with error code `NOT_READY`

### `0x0A` GET_VAR_LIST

**Request payload:** `u8 start_idx`, `u8 max_count`

**Response data:**

- `u8 total_count`
- `u8 start_idx`
- `u8 count`
- Repeated `count` times: `char[VSCOPE_NAME_LEN]` name

### `0x0B` GET_CHANNEL_MAP

**Request:** empty payload  
**Response data:** `u8[VSCOPE_NUM_CHANNELS]` var IDs

### `0x0C` SET_CHANNEL_MAP

**Request payload:** `u8 channel_idx` + `u8 catalog_idx`
**Response data:** `u8 channel_idx` + `u8 catalog_idx` (echo)

### `0x0D` GET_RT_LABELS

**Request payload:** `u8 start_idx`, `u8 max_count`

**Response data:**

- `u8 total_count`
- `u8 start_idx`
- `u8 count`
- Repeated `count` times: `char[VSCOPE_NAME_LEN]` name

### `0x0E` GET_RT_BUFFER

**Request payload:** `u8 index`  
**Response data:** `float value`

### `0x0F` SET_RT_BUFFER

**Request payload:** `u8 index`, `float value`  
**Response data:** `float value`

### `0x10` GET_TRIGGER

**Request:** empty payload  
**Response data:** `float threshold`, `u8 channel`, `u8 mode`

Trigger modes:

- `0` DISABLED
- `1` RISING
- `2` FALLING
- `3` BOTH

### `0x11` SET_TRIGGER

**Request payload:** `float threshold`, `u8 channel`, `u8 mode`  
**Response data:** `float threshold`, `u8 channel`, `u8 mode`

### `0xFF` ERROR

**Request:** none (response only)  
**Response data:** `u8 error_code`

## Error codes

Returned as payload of `0xFF` ERROR frames.

- `0x01` BAD_LEN
- `0x02` BAD_PARAM
- `0x04` RANGE
- `0x05` NOT_READY
