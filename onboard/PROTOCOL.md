# VScope Serial Protocol (CRSF-inspired)

## Framing

```
┌─────────┬────────────┬──────┬───────────┬─────┐
│ SYNC    │ LEN        │ TYPE │ PAYLOAD   │ CRC │
│ 0xC8    │ N+2        │ 1B   │ 0-512B    │ 1B  │
└─────────┴────────────┴──────┴───────────┴─────┘
```

- **SYNC**: `0xC8`
- **LEN**: 2 bytes little-endian, bytes after LEN (TYPE + PAYLOAD + CRC)
- **CRC**: CRC8 DVB-S2 (poly `0xD5`), computed over TYPE + PAYLOAD
- **Endianness**: little-endian for all multi-byte values
- **Max payload**: 512 bytes (configurable)

## Response format

All responses use the **same TYPE** as the request. Payload begins with:

- `status` byte:
  - `0x00` = success
  - `0x01+` = error code (no additional data)

## Message Types

### `0x01` GET_INFO
**Request:** empty payload  
**Response data:**

- `u8` protocol_version
- `u8` channel_count
- `u16` buffer_size
- `u8` var_count
- `char[VSCOPE_DEVICE_NAME_LEN]` device_name (fixed length)

### `0x02` GET_TIMING
**Request:** empty payload  
**Response data:** `u32 divider`, `u32 pre_trig`

### `0x03` SET_TIMING
**Request payload:** `u32 divider`, `u32 pre_trig`  
**Response:** status

### `0x04` GET_STATE
**Request:** empty payload  
**Response data:** `u8 state`

### `0x05` SET_STATE
**Request payload:** `u8 state`  
**Response:** status

Valid states:
- `0` HALTED
- `1` RUNNING
- `2` ACQUIRING
- `3` MISCONFIGURED (read-only)

### `0x06` TRIGGER
**Request:** empty payload  
**Response:** status

### `0x07` GET_FRAME
**Request:** empty payload  
**Response data:** `float[VSCOPE_NUM_CHANNELS]` (mapped channels)

### `0x08` GET_SNAPSHOT_HEADER
**Request:** empty payload  
**Response data:**

- `u8[VSCOPE_NUM_CHANNELS]` channel_map (var IDs)
- `u16` first_element (trigger/oldest sample index)
- `u16` sample_count (buffer_size)
- `u16` pre_trig

### `0x09` GET_SNAPSHOT_DATA
**Request payload:** `u16 start_sample`, `u8 sample_count`  
**Response data:** `float[sample_count * VSCOPE_NUM_CHANNELS]`

Notes:
- `start_sample` is relative to `first_element`
- Host controls `sample_count` to adapt to noisy links
- Max sample_count = `(VSCOPE_MAX_PAYLOAD - 1) / (VSCOPE_NUM_CHANNELS * 4)`

### `0x0A` GET_VAR_LIST
**Request payload (optional):**

- `u8 start_idx` (default 0)
- `u8 max_count` (default all)

**Response data:**

- `u8 total_count`
- `u8 start_idx`
- `u8 count`
- Repeated `count` times:
  - `u8 id`
  - `char[VSCOPE_NAME_LEN]` name

### `0x0B` GET_CHANNEL_MAP
**Request:** empty payload  
**Response data:** `u8[VSCOPE_NUM_CHANNELS]` var IDs

### `0x0C` SET_CHANNEL_MAP
**Request payload:** `u8[VSCOPE_NUM_CHANNELS]` var IDs  
**Response:** status

### `0x0D` GET_CHANNEL_LABELS
**Request:** empty payload  
**Response data:** `char[VSCOPE_NAME_LEN]` x `VSCOPE_NUM_CHANNELS`

### `0x0E` GET_RT_LABELS
**Request:** empty payload  
**Response data:** `char[VSCOPE_NAME_LEN]` x `VSCOPE_RT_BUFFER_LEN`

### `0x0F` GET_RT_BUFFER
**Request payload:** `u8 index`  
**Response data:** `float value`

### `0x10` SET_RT_BUFFER
**Request payload:** `u8 index`, `float value`  
**Response:** status

## Error codes

- `0x01` BAD_LEN
- `0x02` BAD_PARAM
- `0x03` BAD_STATE
- `0x04` RANGE
- `0x05` NOT_READY
