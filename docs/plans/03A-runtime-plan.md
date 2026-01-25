# Effect-TS Runtime Plan

Control logic, device management, retry/backoff, and Rust-to-UI mapping.

## Overview

Single Effect ManagedRuntime for the entire application. Services manage device lifecycle, protocol messaging, polling loops, and state synchronization with Svelte stores.

## Effect-TS Concepts Used

### ManagedRuntime

Creates a long-lived runtime from composed Layers. Manages service lifecycles and provides dependency injection. Ideal for Tauri where entry point control is limited.

```typescript
import { ManagedRuntime, Layer } from "effect";

const MainLayer = Layer.mergeAll(
  SerialPortServiceLive,
  DeviceServiceLive,
  DeviceManagerLive,
  PollingServiceLive,
  SnapshotCacheServiceLive,
  ConfigServiceLive,
);

export const Runtime = ManagedRuntime.make(MainLayer);
```

### Layer Composition

- `Layer.merge` - combine independent services
- `Layer.provide` - wire dependencies
- `Layer.scoped` - resources with lifecycle (acquire/release)

### Schedule (Retry/Repeat)

Built-in composable policies:

- `Schedule.spaced("50ms")` - fixed interval repeating (20Hz polling)
- `Schedule.recurs(2)` - max 3 attempts total (no backoff)
- `Schedule.whileInput(pred)` - conditional continuation

**Current policy**: no backoff; retries are immediate and limited to CRC/Decode errors only.

### Error Handling

- `Effect.fail(error)` - typed, expected errors (protocol errors, timeouts)
- `Effect.die(defect)` - unrecoverable defects (should never happen)
- **Policy**: All errors should use `fail`, never `die`. Never kill the runtime.

## Service Definitions

### SerialPortService

Thin wrapper around Tauri `invoke()` commands.

```typescript
interface SerialPortService {
  listPorts: (filters?: PortFilter) => Effect<PortInfo[], SerialError>;
  openDevice: (
    path: string,
    config: SerialConfig,
  ) => Effect<DeviceHandle, SerialError>;
  closeDevice: (handle: DeviceHandle) => Effect<void, SerialError>;
  flushDevice: (handle: DeviceHandle) => Effect<void, SerialError>;
  sendRequest: (
    handle: DeviceHandle,
    payload: Uint8Array,
  ) => Effect<Uint8Array, SerialError>;
}
```

**Error types**:

- `SerialError.Timeout` - no response within deadline
- `SerialError.Disconnected` - port no longer available
- `SerialError.IoError` - general I/O failure
- `SerialError.CrcMismatch` - response CRC invalid (surfaced by Rust transport)

**Retry policy**: None at this layer (delegated to higher layers).

### DeviceService

Per-device protocol layer. Sends typed messages, parses responses.

```typescript
interface DeviceService {
  getInfo: (handle: DeviceHandle) => Effect<DeviceInfo, ProtocolError>;
  getTiming: (handle: DeviceHandle) => Effect<TimingConfig, ProtocolError>;
  setTiming: (
    handle: DeviceHandle,
    config: TimingConfig,
  ) => Effect<void, ProtocolError>;
  getState: (handle: DeviceHandle) => Effect<DeviceState, ProtocolError>;
  setState: (
    handle: DeviceHandle,
    state: DeviceState,
  ) => Effect<void, ProtocolError>;
  trigger: (handle: DeviceHandle) => Effect<void, ProtocolError>;
  getFrame: (handle: DeviceHandle) => Effect<FrameData, ProtocolError>;
  getSnapshotHeader: (
    handle: DeviceHandle,
  ) => Effect<SnapshotHeader, ProtocolError>;
  getSnapshotData: (
    handle: DeviceHandle,
    start: number,
    count: number,
  ) => Effect<SnapshotChunk, ProtocolError>;
  getVarList: (
    handle: DeviceHandle,
    start?: number,
    max?: number,
  ) => Effect<VarListPage, ProtocolError>;
  getChannelMap: (handle: DeviceHandle) => Effect<ChannelMap, ProtocolError>;
  setChannelMap: (
    handle: DeviceHandle,
    map: ChannelMap,
  ) => Effect<void, ProtocolError>;
  getChannelLabels: (handle: DeviceHandle) => Effect<string[], ProtocolError>;
  getRtLabels: (handle: DeviceHandle) => Effect<string[], ProtocolError>;
  getRtBuffer: (
    handle: DeviceHandle,
    index: number,
  ) => Effect<number, ProtocolError>;
  setRtBuffer: (
    handle: DeviceHandle,
    index: number,
    value: number,
  ) => Effect<void, ProtocolError>;
  getTrigger: (handle: DeviceHandle) => Effect<TriggerConfig, ProtocolError>;
  setTrigger: (
    handle: DeviceHandle,
    config: TriggerConfig,
  ) => Effect<void, ProtocolError>;
}
```

**Error types**:

- `ProtocolError.BadLen` - invalid payload length
- `ProtocolError.BadParam` - invalid parameter value
- `ProtocolError.Range` - index out of range
- `ProtocolError.NotReady` - snapshot not available
- `ProtocolError.DecodeError` - malformed/invalid response payload

**CRC note**: CRC mismatch is not surfaced by the current transport layer; to enable CRC-specific retry, Rust transport must expose a dedicated error (or map CRC to `DecodeError`).

**Retry policy**: Retry only on CRC/Decode errors, max 3 attempts total, no backoff. All other errors fail immediately.

### DeviceManager

Coordinates multiple devices. Tracks saved vs active devices.

```typescript
interface DeviceManager {
  // Device list management
  refreshPortList: () => Effect<PortInfo[], never>;

  // Connection management
  connect: (path: string) => Effect<ConnectedDevice, ConnectionError>;
  disconnect: (deviceId: DeviceId) => Effect<void, never>;

  // Selection tracking
  selectDevice: (deviceId: DeviceId) => Effect<void, never>;
  deselectDevice: (deviceId: DeviceId) => Effect<void, never>;
  getSelectedDevices: () => Effect<DeviceId[], never>;
  getActiveDevices: () => Effect<ConnectedDevice[], never>;

  // Multi-device state
  getCommonLabels: () => Effect<CommonLabels, never>;

  // Event stream
  deviceEvents: Stream<DeviceEvent>;
}

type DeviceEvent =
  | { type: "connected"; device: ConnectedDevice }
  | { type: "disconnected"; deviceId: DeviceId; reason: string }
  | { type: "stateChanged"; deviceId: DeviceId; state: DeviceState }
  | { type: "error"; deviceId: DeviceId; error: ProtocolError };
```

**Device tracking**:

- `savedDevices` - user's intended device set (persists across reconnects)
- `activeDevices` - currently connected and responding subset

When a device disconnects, it remains in `savedDevices` but leaves `activeDevices`. UI shows disconnected state. User can see which saved devices have dropped without re-listing.

**Multi-device matching**:

- **Mandatory match**: `channel_count` must be equal across all active devices
- **Label intersection**: RT buffer labels and channel labels use string comparison; enable union where all devices share the label
- **State sync**: All active devices receive same SET commands

### PollingService

Manages periodic polling loops for all active devices.

```typescript
interface PollingService {
  start: () => Effect<void, never>;
  stop: () => Effect<void, never>;

  // Configuration (persisted)
  setStatePollingRate: (hz: number) => Effect<void, never>;
  setFramePollingRate: (hz: number) => Effect<void, never>;

  // Data streams
  stateUpdates: Stream<Map<DeviceId, DeviceState>>;
  frameUpdates: Stream<Map<DeviceId, FrameData>>;
}
```

**Polling behavior**:

- State polling: default 20Hz (50ms), always runs for all active devices
- Frame polling: default 10Hz (100ms), always runs for all active devices
- Both rates are user-configurable and persisted

**Failure handling for polling**:

- Live polling should **drop** values on failure, not delay
- State polling: retry only on CRC/Decode errors (max 3 attempts), no backoff
- Frame polling: no retry; CRC/Decode errors are dropped (missed samples)
- Transport/protocol errors: fail immediately
- Disconnect detection: multiple consecutive timeouts → mark device inactive

### SnapshotCacheService

Local persistence for downloaded snapshots.

```typescript
interface SnapshotCacheService {
  download: (deviceId: DeviceId) => Effect<Snapshot, DownloadError>;
  list: () => Effect<SnapshotMeta[], never>;
  get: (snapshotId: SnapshotId) => Effect<Snapshot, NotFoundError>;
  delete: (snapshotId: SnapshotId) => Effect<void, never>;
  export: (
    snapshotId: SnapshotId,
    format: ExportFormat,
  ) => Effect<Uint8Array, ExportError>;
}
```

**Download retry logic**:

- On chunk failure: reduce chunk size and retry (not longer interval)
- Start with max chunk size (63 samples)
- On failure: halve chunk size (31, 15, 7, 3, 1)
- If single-sample chunks still fail: abort download

```typescript
const downloadWithAdaptiveChunks = (
  device: DeviceHandle,
  header: SnapshotHeader,
) =>
  Effect.gen(function* () {
    let chunkSize = 63; // max samples per chunk
    let offset = 0;
    const samples: FrameData[] = [];

    while (offset < header.bufferSize) {
      const result = yield* pipe(
        DeviceService.getSnapshotData(device, offset, chunkSize),
        Effect.retry(
          Schedule.recurs(2).pipe(
            Schedule.tapOutput(() =>
              Effect.sync(() => {
                chunkSize = Math.max(1, Math.floor(chunkSize / 2));
              }),
            ),
          ),
        ),
        Effect.catchTag("Timeout", () => {
          if (chunkSize === 1)
            return Effect.fail(new DownloadError.ChunkFailure());
          chunkSize = Math.max(1, Math.floor(chunkSize / 2));
          return Effect.fail(new RetryWithSmallerChunk());
        }),
      );

      samples.push(...result.data);
      offset += result.count;
    }

    return samples;
  });
```

### ConfigService

Persistent application configuration.

```typescript
interface ConfigService {
  get: <K extends keyof AppConfig>(key: K) => Effect<AppConfig[K], never>;
  set: <K extends keyof AppConfig>(
    key: K,
    value: AppConfig[K],
  ) => Effect<void, never>;
  save: () => Effect<void, ConfigError>;
  load: () => Effect<void, ConfigError>;
}

interface AppConfig {
  // Timeout settings
  frameTimeoutMs: number; // default 100

  // Polling rates
  statePollingHz: number; // default 20
  framePollingHz: number; // default 10

  // Live buffer
  liveBufferSize: number; // default 100

  // Serial history
  savedPorts: SavedPort[];
}
```

**Storage**: JSON file in Tauri app data directory.

## Retry Policies by Message Type

| Message          | Retry    | Strategy              | Notes                         |
| ---------------- | -------- | --------------------- | ----------------------------- |
| list_ports       | No       | -                     | Just show what's available    |
| open_device      | No       | -                     | Transport errors fail fast    |
| close_device     | No       | -                     | Best effort                   |
| GET_INFO         | Yes      | CRC only, max 3       | Critical for handshake        |
| GET_STATE        | Yes      | CRC only, max 3       | Polling; fail fast on non-CRC |
| SET_STATE        | Yes      | CRC only, max 3       | User action                   |
| GET_FRAME        | **Drop** | CRC only, no retry    | Polling; skip on CRC          |
| GET*SNAPSHOT*\*  | Yes      | **Reduce chunk size** | See adaptive download         |
| GET_VAR_LIST     | Yes      | CRC only, max 3       | One-time during connect       |
| SET\_\* commands | Yes      | CRC only, max 3       | User actions                  |
| TRIGGER          | Yes      | CRC only, max 3       | User action                   |

**Key distinction**:

- **CRC/Decode errors**: retry up to 3 attempts (except frame polling)
- **Error response** (device replied with error code): do not retry, surface to UI
- **Transport errors** (SerialError): do not retry

## Svelte Store Integration

Effect services emit events; Svelte stores derive from these.

```typescript
// In Effect layer
const deviceEvents: Stream<DeviceEvent> = ...

// Bridge to Svelte
export const deviceStore = writable<Map<DeviceId, ConnectedDevice>>(new Map())
export const frameStore = writable<Map<DeviceId, FrameData[]>>(new Map())
export const stateStore = writable<Map<DeviceId, DeviceState>>(new Map())

// Run in ManagedRuntime
Stream.runForEach(deviceEvents, (event) => {
  switch (event.type) {
    case "connected":
      deviceStore.update(m => m.set(event.device.id, event.device))
      break
    case "disconnected":
      deviceStore.update(m => { m.delete(event.deviceId); return m })
      frameStore.update(m => { m.delete(event.deviceId); return m }) // clear on disconnect
      break
    case "stateChanged":
      stateStore.update(m => m.set(event.deviceId, event.state))
      break
  }
})
```

**Live buffer management**:

- Circular buffer per device (configurable size, default 100 frames)
- New frames push to buffer, oldest drops when full
- **Clear on disconnect** - no stale data
- Implemented in Svelte store, not Effect layer

```typescript
export const frameStore = writable<Map<DeviceId, CircularBuffer<FrameData>>>(
  new Map(),
);

function pushFrame(deviceId: DeviceId, frame: FrameData) {
  frameStore.update((m) => {
    const buffer = m.get(deviceId) ?? new CircularBuffer(config.liveBufferSize);
    buffer.push(frame);
    return m.set(deviceId, buffer);
  });
}
```

## Effect Patterns Reference

### Service definition pattern

```typescript
import { Context, Effect, Layer } from "effect";

class MyService extends Context.Tag("MyService")<
  MyService,
  {
    doSomething: (input: string) => Effect<Output, MyError>;
  }
>() {}

const MyServiceLive = Layer.succeed(MyService, {
  doSomething: (input) => Effect.succeed({ result: input.toUpperCase() }),
});
```

### Wrapping Tauri invoke

```typescript
import { invoke } from "@tauri-apps/api/core";

const tauriInvoke = <T>(cmd: string, args: unknown) =>
  Effect.tryPromise({
    try: () => invoke<T>(cmd, args),
    catch: (error) => new TauriError({ cause: error }),
  });
```

### Resource management

```typescript
const DeviceResource = Effect.acquireRelease(
  // Acquire
  SerialPortService.openDevice(path, config),
  // Release
  (handle) => SerialPortService.closeDevice(handle).pipe(Effect.ignore),
);

// Use with scoped
const withDevice = <A, E>(
  path: string,
  config: SerialConfig,
  use: (handle: DeviceHandle) => Effect<A, E>,
) => Effect.scoped(Effect.flatMap(DeviceResource, use));
```

### Polling with Schedule

```typescript
const pollState = Effect.repeat(
  getStateForAllDevices,
  Schedule.spaced("50ms"), // 20Hz
);

const pollFrames = Effect.repeat(
  getFrameForAllDevices,
  Schedule.spaced("100ms"), // 10Hz
);
```

## Resources

- [Effect Runtime docs](https://effect.website/docs/runtime/)
- [Managing Layers](https://effect.website/docs/requirements-management/layers/)
- [Built-in Schedules](https://effect.website/docs/scheduling/built-in-schedules/)
- [Effect Patterns Repository](https://github.com/PaulJPhilp/EffectPatterns)
- [TypeOnce Effect Beginners Course](https://www.typeonce.dev/course/effect-beginners-complete-getting-started/runtime/managed-runtime)
