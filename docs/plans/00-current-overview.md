# VScope rewrite overview (current Python app + onboard C + vscope-rs notes)

## Why this exists
High-level map of current GUI behavior, message protocol, and embedded C module. Intended as a seed document for a Tauri + Rust + React/Svelte rewrite.

## Current Python app at a glance
- Entry: `main.py` -> `app/gui/__init__.py` (PyQt6 + pyqtgraph + qasync)
- Layout: single main window with three stacked panels
  - Top: VScope controls (refresh/run/save/trigger + acquisition/pretrigger inputs)
  - Middle: RT buffer controls (16 float inputs)
  - Bottom: snapshot list (context menu for plot/compare/export/delete)
- Device model: multi-device supported, but all devices must match channels/buffer/labels

## UI behavior (core features)
- Refresh
  - Scans serial devices using VID/PID + optional name regex from settings
  - Handshake per device, then channel labels queried
  - Updates channels/samples labels and run state
  - Reads timing + all 16 RT buffers when devices present
- Run/Stop
  - Toggle state (RUN <-> STOP) via serial messages
- Trigger button
  - If RUN state: opens live plot window (10 Hz live data)
  - If STOP state: send TRIGGER (acquire snapshot in device)
- Save snapshot
  - Prompts for description, downloads full buffer, persists in cache
- Snapshots
  - Context menu: plot single, compare multiple (if metadata matches), export CSV, delete
  - Cache retention: default 31 days (configurable)

## GUI data flow (timers + live plotting)
- State sampling loop: 20 Hz, `get_state()`; maps device state to run button state
- Frame sampling loop: 10 Hz, `get_frame()`; stored in a deque (100 entries)
- Live plot window reads deque; NaN prefill for smooth scrolling
- Plot windows are separate QWidget instances per action

## Settings / persistence
- Settings stored in `config.toml` under user config dir (platformdirs)
- Settings include: serial params, onboard polling rate, cache retention, VID/PID, regex
- Snapshots cached in user cache dir: metadata.json + data.npz

## Serial protocol (current Python + onboard C)
Protocol is fixed 9-byte request: 1-byte key + 8-byte payload. Response size varies.

| Key | Name | Request payload | Response |
| --- | --- | --- | --- |
| `h` | HANDSHAKE | padding | 2B channels + 2B buffer_len + 10B device_name |
| `t` | GET_TIMING | padding | 4B divider + 4B pretrigger |
| `T` | SET_TIMING | divider + pretrigger | 1B (0=ok) |
| `s` | GET_STATE | padding | 1B state (0 halted, 1 running, 2 acquiring, 3 misconfigured) |
| `S` | SET_STATE | padding + state | 1B (0=ok) |
| `b` | GET_BUFF | padding + index | 4B float |
| `B` | SET_BUFF | index + float | 1B (0=ok) |
| `f` | GET_FRAME | padding | N channels * 4B float |
| `l` | GET_LABEL | padding + channel | 0..40B null-terminated string |
| `d` | DOWNLOAD | padding | buffer_len * channels * 4B float |

Notes:
- Python expects fixed response sizes per command (`core/devices.py`)
- For multi-device, responses must match exactly or GUI treats as mismatch
- `GET_FRAME` uses current frame values, not buffered history

## Embedded C module summary
Files: `onboard/vscope.h`, `onboard/interface.c`, `onboard/logger.c`

Core structs and state:
- `VscopeStruct` holds state, request, buffer, channel pointers, timing, indices
- Defaults: 10 channels, buffer size 1000, device name length 10
- RT buffer length: 16 float values (trigger params, user values)

Key functions:
- `vscopeInit(device_name, isr_khz)`
  - Initializes buffers/state, sets defaults, sets device name
  - Defines channel pointers and channel names
- `vscopeAcquire()`
  - Called at high rate; does divider-based downsampling
  - Handles state machine: HALTED -> RUNNING -> ACQUIRING -> HALTED
  - Saves frames into circular buffer; manages `first_element` for download
- `vscopeTrigger()`
  - Sets request to acquire when in RUNNING state
- `vscopeProcessMessage()`
  - Implements the 9-byte protocol handler and responses
- RT buffer helpers: `vscopeGetRtBuffer`, `vscopeSetRtBuffer`

Trigger behavior:
- Trigger params live in RT buffer indices (threshold/channel/mode)
- Trigger detection uses zero-crossing on selected channel
 - RT buffer indices: `TRG_THRESHOLD=0`, `TRG_CHANNEL=1`, `TRG_MODE=2`, remaining 13 free slots

## Snapshot model (Python side)
- Snapshot holds: uid (timestamp), description, channels, buffer_len, timing, labels
- Data stored per device as `np.ndarray[channels, buffer_len]`
- Compare allowed only when channels, buffer_len, timing, labels all match exactly

## vscope-rs (half-baked Rust/Tauri) notes
Location: `/Users/tomford/code/projects/vscope-rs`

Rust core highlights:
- Tauri shell + tokio-serial async device I/O
- `Manager` handles multi-device fanout and response equality checks
- More ambitious protocol ideas:
  - Additional message keys: `D` (snapshot), `d` (header), `c` (set channel)
  - Requests for vscope labels and RT buffer labels
  - Snapshot header includes timing + trigger message + channel mapping
- Stronger device discovery filter (VID/PID + product/manufacturer match)

Important protocol mismatch vs current C/Python:
- Rust handshake expects 6 bytes: 4B interface_version + 2B ID bytes
- Current C handshake returns 14 bytes: channels + buffer_len + 10B device name
- Rust also expects `GET_STATUS` to return 2 bytes (state + download-valid flag)

GUI notes in vscope-rs:
- React + uPlot live plotting, grouped by LivePlotGroup context
- `Plot` component exposes imperative API for realtime data updates
- UI layout is a placeholder but contains ideas:
  - Channel configuration popover with variable mapping
  - Snapshot table and buffer grid design
  - Demo worker for 100 Hz ingest, 60 Hz render

## Takeaways for rewrite
- Preserve core concepts: channels, RT buffers, snapshots with timing, live view
- Decide protocol version early (current C vs vscope-rs extensions)
- Keep multi-device equality checks (or redesign how conflicts resolve)
- Snapshot cache and metadata model are stable and worth keeping
- Live plot expects rolling buffer; decouple sampling rate from render rate

## Primary reference files
- GUI entry: `app/gui/__init__.py`
- UI panels: `app/components/*`
- Handlers: `app/callbacks/*`
- Plotting: `app/plot/*`
- Serial + protocol glue: `core/devices.py`, `core/interface.py`
- Snapshots: `core/snapshots.py`
- C protocol: `onboard/interface.c`, `onboard/logger.c`, `onboard/PROTOCOL.md`
- vscope-rs: `core/src/manager.rs`, `core/src/interface.rs`, `core/src/device.rs`, `gui/src/App.tsx`
