# UI Schema (Current)

## Device Management

- Saved/Available tables implemented (Devices page).
- Persisted saved ports via DB; runtime session state wired.
- Default serial settings editable in Settings modal.
- Per-device overrides stored but no edit UI yet.

## Main View (Scope)

- Live plots implemented with ring buffer sized by `framePollingHz` + `liveBufferDurationS`.
- Control buttons present (Channels/Timing/Trigger/Display) but no popovers yet.

## General Settings

- Settings modal implemented (polling, serial, snapshots).

## Snapshots

- Persistence implemented (meta + data in DB; lazy load in store).
- UI view still placeholder; table/actions not wired.

## Plots + Multi-Views

- Single scope view only.
- No multi-view/tabs/compare UI yet.
