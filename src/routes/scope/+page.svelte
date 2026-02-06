<script lang="ts">
  import { untrack } from "svelte";
  import { Plot } from "$lib/components/plot";
  import { Item } from "$lib/components/ui/item";
  import ChannelsPopover from "$lib/components/scope/channels-popover.svelte";
  import TimingPopover from "$lib/components/scope/timing-popover.svelte";
  import TriggerPopover from "$lib/components/scope/trigger-popover.svelte";
  import RtBufferPopover from "$lib/components/scope/rt-buffer-popover.svelte";
  import RunStopButton from "$lib/components/scope/run-stop-button.svelte";
  import { frameTick } from "$lib/store/runtime";
  import { connectedDevices } from "$lib/store/device-store";
  import {
    consensusStaticInfo,
    consensusChannelMap,
  } from "$lib/store/device-consensus";
  import { settings } from "$lib/settings";
  import type uPlot from "uplot";

  type FrameRing = {
    path: string;
    label: string;
    color: string;
    size: number;
    channels: number;
    frameHz: number;
    cursor: number;
    data: Array<Array<number | null>>;
  };

  type ChannelPlot = {
    x: Array<number>;
    series: uPlot.Series[];
  };

  const colors = [
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#eab308",
    "#a855f7",
    "#14b8a6",
    "#f97316",
    "#0ea5e9",
  ];

  const sessions = $derived($connectedDevices);

  const ringConfig = $derived({
    frameHz: $settings.framePollingHz,
    durationS: $settings.liveBufferDurationS,
    channels: $consensusStaticInfo.value?.numChannels ?? 0,
    size: Math.max(
      1,
      Math.round($settings.framePollingHz * $settings.liveBufferDurationS),
    ),
  });

  const createRing = (
    path: string,
    label: string,
    color: string,
    size: number,
    channels: number,
    frameHz: number,
    cursor: number = size - 1,
  ): FrameRing => ({
    path,
    label,
    color,
    size,
    channels,
    frameHz,
    cursor,
    data: Array.from({ length: channels }, () =>
      Array.from({ length: size }, () => null),
    ),
  });

  const mapCursorForResize = (prev: FrameRing, nextSize: number): number => {
    const prevNext = (prev.cursor + 1) % prev.size;
    const ratio = prevNext / prev.size;
    const mappedNext = Math.max(
      0,
      Math.min(nextSize - 1, Math.floor(ratio * nextSize)),
    );
    return (mappedNext - 1 + nextSize) % nextSize;
  };

  // Use regular variables for mutable data (not reactive)
  let rings: FrameRing[] = [];
  let displayPlots: ChannelPlot[] = [];
  let colorMap: Record<string, string> = {};
  let layoutKey = "";
  let lastChannelMap: number[] | null = null;

  // Reactive flag for template rendering
  let hasPlots = $state(false);
  // Reactive series for template
  let plotSeries = $state.raw<uPlot.Series[][]>([]);
  // Reactive plot data arrays - reassigned on each tick to trigger updates
  let plotDataArrays = $state.raw<uPlot.AlignedData[]>([]);

  const assignColors = (paths: string[]) => {
    const used = [...Object.values(colorMap)];
    let paletteIndex = 0;
    const pickColor = () => {
      while (paletteIndex < colors.length && used.includes(colors[paletteIndex])) {
        paletteIndex += 1;
      }
      if (paletteIndex < colors.length) {
        const color = colors[paletteIndex];
        paletteIndex += 1;
        used.push(color);
        return color;
      }
      return colors[paths.length % colors.length];
    };
    for (const path of paths) {
      if (!colorMap[path]) {
        colorMap[path] = pickColor();
      }
    }
  };

  const clearChannels = (indices: number[]) => {
    if (indices.length === 0) return;

    for (const ring of rings) {
      for (const index of indices) {
        ring.data[index]?.fill(null);
      }
    }
    plotDataArrays = displayPlots.map(
      (plot, channelIdx) =>
        [plot.x, ...rings.map((ring) => ring.data[channelIdx])] as uPlot.AlignedData,
    );
  };

  // Create/update rings when sessions or config change
  $effect(() => {
    const { size, channels, frameHz } = ringConfig;
    const currentSessions = sessions;
    const paths = currentSessions.map((s) => s.path);
    const channelMapLen = $consensusChannelMap.value?.varIds?.length ?? 0;

    if (channels <= 0 || paths.length === 0 || channelMapLen < channels) {
      layoutKey = "";
      rings = [];
      displayPlots = [];
      hasPlots = false;
      plotSeries = [];
      plotDataArrays = [];
      return;
    }

    const labels = currentSessions.map((session) => session.info?.deviceName ?? session.path);
    const nextLayoutKey = `${size}:${channels}:${frameHz}:${paths.join(",")}:${labels.join(",")}`;
    if (nextLayoutKey === layoutKey) return;
    layoutKey = nextLayoutKey;

    assignColors(paths);

    const existing = new Map(rings.map((ring) => [ring.path, ring]));
    const next: FrameRing[] = [];
    for (const session of currentSessions) {
      const path = session.path;
      const label = session.info?.deviceName ?? path;
      const color = colorMap[path] ?? colors[0];
      const prev = existing.get(path);
      if (
        prev &&
        prev.size === size &&
        prev.channels === channels &&
        prev.frameHz === frameHz
      ) {
        prev.label = label;
        prev.color = color;
        next.push(prev);
      } else {
        const mappedCursor = prev
          ? mapCursorForResize(prev, size)
          : size - 1;
        next.push(
          createRing(path, label, color, size, channels, frameHz, mappedCursor),
        );
      }
    }
    rings = next;

    // Build plot metadata. Data arrays come directly from ring storage.
    const x = Array.from({ length: size }, (_, i) => i / frameHz);
    displayPlots = Array.from({ length: channels }, () => ({
      x,
      series: next.map((ring) => ({ label: ring.label, stroke: ring.color })),
    }));

    hasPlots = displayPlots.length > 0;
    plotSeries = displayPlots.map((p) => p.series);
    plotDataArrays = displayPlots.map(
      (plot, channelIdx) =>
        [plot.x, ...next.map((ring) => ring.data[channelIdx])] as uPlot.AlignedData,
    );
  });

  // Clear channel buffers when channel map changes
  $effect(() => {
    const channelMap = $consensusChannelMap.value?.varIds ?? null;
    if (!channelMap) {
      lastChannelMap = null;
      return;
    }

    if (rings.length === 0 || displayPlots.length === 0) {
      lastChannelMap = [...channelMap];
      return;
    }

    if (!lastChannelMap) {
      lastChannelMap = [...channelMap];
      return;
    }

    if (channelMap.length !== lastChannelMap.length) {
      clearChannels(
        Array.from(
          { length: Math.min(channelMap.length, displayPlots.length) },
          (_, index) => index,
        ),
      );
      lastChannelMap = [...channelMap];
      return;
    }

    const changed: number[] = [];
    for (let index = 0; index < channelMap.length; index += 1) {
      if (channelMap[index] !== lastChannelMap[index]) {
        changed.push(index);
      }
    }

    if (changed.length === 0) return;
    clearChannels(changed);
    lastChannelMap = [...channelMap];
  });

  // On each frame tick: sweep write one point and keep a single null flyback gap.
  $effect(() => {
    const frameTick_ = $frameTick;
    if (frameTick_ === 0) return;

    const currentRings = rings;
    const currentSessions = untrack(() => sessions);

    if (currentRings.length === 0) return;
    const frameByPath = new Map(
      currentSessions.map((session) => [session.path, session.frame]),
    );

    // Write one point at next cursor and keep one null slot ahead (sweep gap).
    for (const ring of currentRings) {
      const writeIdx = (ring.cursor + 1) % ring.size;
      const gapIdx = (writeIdx + 1) % ring.size;
      const frame = frameByPath.get(ring.path);
      for (let c = 0; c < ring.channels; c += 1) {
        ring.data[c][writeIdx] = frame?.values[c] ?? null;
        if (ring.size > 1) {
          ring.data[c][gapIdx] = null;
        }
      }
      ring.cursor = writeIdx;
    }

    plotDataArrays = displayPlots.map(
      (plot, channelIdx) =>
        [plot.x, ...currentRings.map((ring) => ring.data[channelIdx])] as uPlot.AlignedData,
    );
  });
</script>

<div class="flex h-full flex-col gap-4 overflow-hidden">
  <!-- Control bar -->
  <div class="flex shrink-0 items-start gap-2">
    <ChannelsPopover />
    <TimingPopover />
    <TriggerPopover />
    <RtBufferPopover />
    <div class="ml-auto">
      <RunStopButton />
    </div>
  </div>

  <!-- 5 channel plots, stacked with shared x-axis -->
  <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
    {#if !hasPlots}
      <Item
        variant="outline"
        class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        Waiting for device frames...
      </Item>
    {:else}
      {#each plotSeries as series, i (i)}
        <Item variant="outline" class="min-h-0 flex-1 p-0">
          <Plot
            data={plotDataArrays[i]}
            {series}
            syncKey="scope"
            showXAxis={false}
            showLegend={false}
            showCursor={false}
            class="h-full w-full"
          />
        </Item>
      {/each}
    {/if}
  </div>
</div>
