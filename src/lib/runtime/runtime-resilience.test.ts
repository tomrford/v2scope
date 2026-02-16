import { describe, expect, it } from "bun:test";
import { Effect, Layer, Queue } from "effect";
import { SerialError, type DeviceError } from "../errors";
import type { DeviceInfo } from "../protocol";
import { State, Endianness } from "../protocol";
import type { PortInfo, SerialConfig } from "../transport/serial.schema";
import { DeviceHandle } from "./DeviceHandle";
import { DeviceService, type DeviceServiceShape } from "./DeviceService";
import { DeviceManager, DeviceManagerLive } from "./DeviceManager";

const testInfo: DeviceInfo = {
  numChannels: 5,
  bufferSize: 1000,
  isrKhz: 10,
  varCount: 8,
  rtCount: 4,
  rtBufferLen: 16,
  nameLen: 16,
  endianness: Endianness.Little,
  deviceName: "test",
};

const testHandle = DeviceHandle(1);

const noop = () => Effect.void as Effect.Effect<void, never>;

const makeTrackedDeviceService = (opts?: {
  getInfoFail?: DeviceError;
  openFail?: DeviceError;
}) => {
  const openCalls: string[] = [];
  const closeCalls: number[] = [];

  const service: DeviceServiceShape = {
    listPorts: () => Effect.succeed([] as PortInfo[]),
    openDevice: (_path, _config) => {
      openCalls.push(_path);
      if (opts?.openFail)
        return Effect.fail(opts.openFail) as Effect.Effect<
          DeviceHandle,
          SerialError
        >;
      return Effect.succeed(testHandle);
    },
    closeDevice: (handle) => {
      closeCalls.push(handle as number);
      return Effect.void as Effect.Effect<void, never>;
    },
    flushDevice: () => Effect.void as Effect.Effect<void, never>,
    getInfo: () => {
      if (opts?.getInfoFail) return Effect.fail(opts.getInfoFail);
      return Effect.succeed(testInfo);
    },
    getTiming: () => Effect.succeed({ divider: 1, preTrig: 0 }),
    setTiming: () => Effect.void as Effect.Effect<void, DeviceError>,
    getState: () => Effect.succeed({ state: State.HALTED }),
    setState: () => Effect.void as Effect.Effect<void, DeviceError>,
    trigger: () => Effect.void as Effect.Effect<void, DeviceError>,
    getFrame: () => Effect.succeed({ values: [0, 0, 0, 0, 0] }),
    getChannelMap: () => Effect.succeed({ varIds: [0, 1, 2, 3, 4] }),
    setChannelMap: () =>
      Effect.succeed({ channelIdx: 0, catalogIdx: 0, varIds: [0, 1, 2, 3, 4] }),
    getVarList: () =>
      Effect.succeed({ totalCount: 0, startIdx: 0, entries: [] }),
    getRtLabels: () =>
      Effect.succeed({ totalCount: 0, startIdx: 0, entries: [] }),
    getRtBuffer: () => Effect.succeed({ value: 0 }),
    setRtBuffer: () => Effect.void as Effect.Effect<void, DeviceError>,
    getTrigger: () =>
      Effect.succeed({ threshold: 0, channel: 0, mode: 0 }),
    setTrigger: () => Effect.void as Effect.Effect<void, DeviceError>,
    getSnapshotHeader: () =>
      Effect.succeed({
        channelMap: [],
        divider: 1,
        preTrig: 0,
        triggerThreshold: 0,
        triggerChannel: 0,
        triggerMode: 0,
        sampleCount: 0,
        rtValues: [],
      }),
    getSnapshotData: () => Effect.succeed({ samples: [] }),
  };

  return { service, openCalls, closeCalls };
};

const testConfig: SerialConfig = {
  baudRate: 115200,
  dataBits: "Eight",
  parity: "None",
  stopBits: "One",
  readTimeoutMs: 100,
};

describe("DeviceManager lifecycle", () => {
  it("closes handle when getInfo fails during connect", async () => {
    const { service, openCalls, closeCalls } = makeTrackedDeviceService({
      getInfoFail: SerialError.Timeout(),
    });

    const testLayer = DeviceManagerLive.pipe(
      Layer.provide(Layer.succeed(DeviceService, service)),
    );

    const program = Effect.gen(function* () {
      const mgr = yield* DeviceManager;
      const result = yield* mgr
        .connect("/dev/test", testConfig)
        .pipe(Effect.either);
      return result;
    }).pipe(Effect.provide(testLayer));

    const result = await Effect.runPromise(program);

    expect(openCalls).toEqual(["/dev/test"]);
    expect(closeCalls).toEqual([testHandle as number]);
    expect(result._tag).toBe("Left");
  });

  it("does not leak handle on successful connect", async () => {
    const { service, openCalls, closeCalls } = makeTrackedDeviceService();

    const testLayer = DeviceManagerLive.pipe(
      Layer.provide(Layer.succeed(DeviceService, service)),
    );

    const program = Effect.gen(function* () {
      const mgr = yield* DeviceManager;
      const device = yield* mgr.connect("/dev/test", testConfig);
      return device;
    }).pipe(Effect.provide(testLayer));

    const device = await Effect.runPromise(program);

    expect(openCalls).toEqual(["/dev/test"]);
    expect(closeCalls).toEqual([]);
    expect(device.path).toBe("/dev/test");
    expect(device.info).toEqual(testInfo);
  });

  it("disconnectAll closes all devices and empties map", async () => {
    const { service, closeCalls } = makeTrackedDeviceService();

    const testLayer = DeviceManagerLive.pipe(
      Layer.provide(Layer.succeed(DeviceService, service)),
    );

    const program = Effect.gen(function* () {
      const mgr = yield* DeviceManager;
      yield* mgr.connect("/dev/a", testConfig);
      yield* mgr.connect("/dev/b", testConfig);

      const before = yield* mgr.getActiveDevices();
      yield* mgr.disconnectAll();
      const after = yield* mgr.getActiveDevices();

      return { before: before.length, after: after.length };
    }).pipe(Effect.provide(testLayer));

    const result = await Effect.runPromise(program);

    expect(result.before).toBe(2);
    expect(result.after).toBe(0);
    expect(closeCalls.length).toBe(2);
  });

  it("disconnect is idempotent for unknown paths", async () => {
    const { service, closeCalls } = makeTrackedDeviceService();

    const testLayer = DeviceManagerLive.pipe(
      Layer.provide(Layer.succeed(DeviceService, service)),
    );

    const program = Effect.gen(function* () {
      const mgr = yield* DeviceManager;
      yield* mgr.disconnect("/dev/nonexistent");
      return closeCalls.length;
    }).pipe(Effect.provide(testLayer));

    const count = await Effect.runPromise(program);
    expect(count).toBe(0);
  });
});

describe("event loop resilience", () => {
  it("catchAllCause survives thrown handler errors", async () => {
    let callCount = 0;
    const events = await Effect.runPromise(Queue.unbounded<string>());

    const processEvent = (event: string): void => {
      callCount += 1;
      if (event === "bad") throw new Error("handler crash");
    };

    const loop = Effect.repeat(
      Queue.take(events).pipe(
        Effect.flatMap((event) => Effect.sync(() => processEvent(event))),
        Effect.catchAllCause(() => Effect.void),
      ),
      { times: 2 },
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Queue.offer(events, "good");
        yield* Queue.offer(events, "bad");
        yield* Queue.offer(events, "after");
        yield* loop;
      }),
    );

    expect(callCount).toBe(3);
  });
});
