# Protocol Versioning

## Problem

MCU firmware is baked in and rarely updated. Desktop client updates frequently. Client must gracefully handle older firmware versions, not reject them.

## Approach: Version-to-Feature Mapping

Client maintains a table of which protocol versions support which features. UI adapts by disabling/hiding unsupported features.

```rust
struct ProtocolFeatures {
    has_trigger: bool,
    has_var_list: bool,
    has_channel_map: bool,
    has_rt_labels: bool,
    has_snapshot_chunked: bool,
}

impl ProtocolFeatures {
    fn from_version(v: u8) -> Self {
        Self {
            // v1: full initial feature set
            has_trigger: v >= 1,
            has_var_list: v >= 1,
            has_channel_map: v >= 1,
            has_rt_labels: v >= 1,
            has_snapshot_chunked: v >= 1,
            // future additions:
            // has_streaming: v >= 2,
            // has_compression: v >= 3,
        }
    }
}
```

## Workflow

1. Client calls `GET_INFO`, extracts `protocol_version`
2. Build `ProtocolFeatures` from version
3. Pass features to UI layer
4. UI grays out / hides controls for unsupported features
5. Effect layer skips unsupported message types

## Adding New Features

1. Implement in C, bump `VSCOPE_PROTOCOL_VERSION`
2. Add message type to `PROTOCOL.md`
3. Add Rust message handler
4. Add feature flag to `ProtocolFeatures::from_version()` with version gate
5. UI checks flag before showing feature

## Alternatives Considered

- **Probing**: Try message, catch `ERR_BAD_PARAM`, set flag. Works but slower on connect.
- **Capability bitmap**: Add `u32 capabilities` to `GET_INFO`. More flexible but requires firmware update to expose new caps.

Version table chosen for simplicity; client holds knowledge, no firmware changes needed for new clients to work with old firmware.
