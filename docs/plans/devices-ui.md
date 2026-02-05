# Devices UI Flow (Current)

## Layout

- Two panels: Saved Devices (left) and Available Ports (right).
- Saved list = persisted saved ports + runtime session state.
- Available list = `list_ports` minus already-saved paths.

## Status + Actions

- Status states: connected / error / deactivated / unknown.
- Status badge shows error hover detail; settings icon when per-device override exists.
- Row actions: Activate/Deactivate, Delete.

## Add / Resync

- Add: select rows in Available Ports → Add → persist + attempt activate.
- Resync All: refresh ports → attempt reconnect for active devices in error state that are present.

## TODO

- Search/filter in tables (path/name/vid/pid).
- Per-device serial settings UI (override + edit).
- Device info details view (GET_INFO fields).
