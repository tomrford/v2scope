# UI Layer Plan (Svelte)

Component specifications, plotting, state management, and user interactions.

## Principles

- One-page control surface + plot area
- Robust device management; no global failure cascade
- Clear state indication: HALTED / RUNNING / ACQUIRING / MISCONFIGURED / DISCONNECTED
- Circular buffer live plots (oscilloscope-style)
- Data clears on device disconnect

## Layout (Subject to Change)

General structure, exact arrangement TBD:

- Device panel: list, status, selection
- Control panel: run/stop, trigger, timing
- RT buffer panel: labeled float inputs
- Snapshot panel: list, actions
- Live plots: multi-channel, multi-device overlays

## Components

### DeviceList

Shows available and connected devices.

**State**:

- `availablePorts: PortInfo[]` - from list_ports
- `selectedDevices: Set<DeviceId>` - user selections (persists across reconnects)
- `activeDevices: Map<DeviceId, ConnectedDevice>` - currently connected

**UI elements**:

- Refresh button (triggers port list refresh)
- Port list with connect/disconnect actions
- Visual distinction: available / selected+disconnected / selected+active
- Per-device error indicator (timeout count, last error)

**Behavior**:

- User explicitly selects devices to connect
- Disconnected devices stay in selection, shown as disconnected
- Active devices show health status

### DeviceStatusCard

Per-device status display within DeviceList.

**Shows**:

- Device name (from GET_INFO)
- Connection state (active/disconnected)
- Device state (HALTED/RUNNING/ACQUIRING/MISCONFIGURED)
- Error counts (CRC failures, timeouts)
- Reconnect button (for disconnected devices)

### ControlPanel

Main device control interface.

**Controls**:

- State toggle: HALTED ↔ RUNNING
- Manual trigger button
- Timing inputs: divider, pre_trig samples
- Trigger config: threshold, channel selector, mode selector

**State locking**:
When any active device is in RUNNING or ACQUIRING state, disable:

- Timing inputs
- Trigger config
- Channel map button

Visual indicator when controls are locked.

### RTBufferGrid

Grid of labeled float inputs for RT buffer values.

**Display**:

- Shows intersection of RT labels across all active devices
- Label + float input per registered buffer
- Only buffers present on ALL active devices are shown

**Behavior**:

- Edit value → send SET_RT_BUFFER to all active devices
- Polling updates values (overwrite UI, no conflict resolution)
- No debounce needed; send on blur or enter

### ChannelMapModal

Modal/popover for channel assignment.

**Shows**:

- 5 channel slots
- Variable catalog (searchable list)
- Current mapping per slot

**Actions**:

- Select variable for each slot
- Apply → send SET_CHANNEL_MAP to all active devices
- Cancel → discard changes

### SnapshotTable

List of cached snapshots with actions.

**Columns**:

- Timestamp
- Device name(s)
- Duration / sample count
- Trigger info

**Actions per row**:

- View/plot
- Compare (select multiple)
- Export (CSV, JSON)
- Delete

### LivePlot

Real-time oscilloscope-style plot.

**Features**:

- Circular buffer display (configurable depth, default 100 frames)
- Multiple channels stacked or overlaid
- Multi-device overlay per channel (color-coded)
- Channel visibility toggles
- Auto-scaling Y axis (with manual override option)

**Data source**:

- `frameStore` (Svelte store fed by PollingService)
- Clears when device disconnects

**Behavior**:

- New data pushes into circular buffer
- Plot scrolls continuously (oscilloscope sweep)
- No historical scroll-back in live mode

### SnapshotPlot

Static plot for viewing downloaded snapshots.

**Features**:

- Full snapshot data (all samples)
- Zoom/pan
- Cursor readout
- Multi-snapshot overlay for comparison
- Export plot as image

## Plotting Library

**Recommendation**: Start with **uPlot** for live plots.

| Library | Performance | Bundle | Features | Notes                                 |
| ------- | ----------- | ------ | -------- | ------------------------------------- |
| uPlot   | Excellent   | ~40KB  | Basic    | Best for live 10Hz updates            |
| ECharts | Good        | ~800KB | Rich     | Overkill for live, good for snapshots |
| Plotly  | Moderate    | ~3MB   | Analysis | Too heavy for live                    |
| Canvas  | Excellent   | 0KB    | DIY      | Fallback if uPlot insufficient        |

**Strategy**:

- Live plots: uPlot (optimized for streaming)
- Snapshot plots: uPlot or Canvas (may need zoom/pan)
- If uPlot proves insufficient: custom Canvas/WebGL

## Svelte Stores

### Core stores (from Effect layer)

```typescript
// Device state
export const availablePorts = writable<PortInfo[]>([])
export const selectedDevices = writable<Set<DeviceId>>(new Set())
export const activeDevices = writable<Map<DeviceId, ConnectedDevice>>(new Map())
export const deviceStates = writable<Map<DeviceId, DeviceState>>(new Map())
export const deviceErrors = writable<Map<DeviceId, DeviceError[]>>(new Map())

// Live data
export const frameBuffers = writable<Map<DeviceId, CircularBuffer<FrameData>>>(new Map())

// Labels (intersection across active devices)
export const commonChannelLabels = derived(activeDevices, ...)
export const commonRtLabels = derived(activeDevices, ...)

// Snapshots
export const snapshots = writable<SnapshotMeta[]>([])
```

### Derived stores

```typescript
// Are any devices in a "locked" state?
export const controlsLocked = derived(deviceStates, (states) =>
  Array.from(states.values()).some((s) => s === "RUNNING" || s === "ACQUIRING"),
);

// Aggregate connection status
export const allDevicesConnected = derived(
  [selectedDevices, activeDevices],
  ([selected, active]) =>
    selected.size > 0 && Array.from(selected).every((id) => active.has(id)),
);
```

### CircularBuffer utility

```typescript
class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  toArray(): T[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}
```

## User Configuration (Persisted)

Settings accessible via config panel:

- Frame timeout (ms)
- State polling rate (Hz)
- Frame polling rate (Hz)
- Live buffer size (samples)
- Export format preference

Stored via `ConfigService` in Effect layer.

## Error Display

**Device-level errors**:

- Show in DeviceStatusCard
- Toast/notification for transient errors
- Persistent error badge until acknowledged

**Global errors**:

- Config save/load failures
- Export failures
- Displayed as toasts or modal

**Error recovery**:

- Reconnect button on disconnected devices
- Retry action on failed operations
- Never require app restart

## Keyboard Shortcuts (TBD)

Consider later:

- Space: toggle run/stop
- T: trigger
- R: refresh device list
- Escape: close modals

## Open Questions (From Original Plan)

- How many plots visible by default?
- Per-device color palette config?
- Snapshot diff view (delta between snapshots)?
- Export formats: CSV only or add binary/JSON?
- Mobile support? (currently desktop-only OK)
