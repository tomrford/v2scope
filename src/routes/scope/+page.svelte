<script lang="ts">
  import { untrack } from "svelte";
  import { Plot } from "$lib/components/plot";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/item";
  import { frameTick } from "$lib/store/runtime";
  import { connectedDevices } from "$lib/store/device-store";
  import { deviceConsensus } from "$lib/store/device-consensus";
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
    ys: Array<Array<number | null>>;
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
    channels: $deviceConsensus.staticInfo.value?.numChannels ?? 0,
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
  ): FrameRing => ({
    path,
    label,
    color,
    size,
    channels,
    frameHz,
    cursor: size - 1,
    data: Array.from({ length: channels }, () =>
      Array.from({ length: size }, () => null),
    ),
  });

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

    for (const index of indices) {
      const plot = displayPlots[index];
      if (!plot) continue;
      for (const ys of plot.ys) {
        ys.fill(null);
      }
    }

    plotDataArrays = displayPlots.map((p) => [p.x, ...p.ys] as uPlot.AlignedData);
  };

  // Create/update rings when sessions or config change
  $effect(() => {
    const { size, channels, frameHz } = ringConfig;
    const currentSessions = sessions;
    const paths = currentSessions.map((s) => s.path);
    const channelMapLen = $deviceConsensus.channelMap.value?.varIds?.length ?? 0;

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
        next.push(createRing(path, label, color, size, channels, frameHz));
      }
    }
    rings = next;

    // Create stable display buffers
    const x = Array.from({ length: size }, (_, i) => i / frameHz);
    displayPlots = Array.from({ length: channels }, () => ({
      x,
      ys: next.map(() => Array.from({ length: size }, () => null)),
      series: next.map((ring) => ({ label: ring.label, stroke: ring.color })),
    }));

    hasPlots = displayPlots.length > 0;
    plotSeries = displayPlots.map((p) => p.series);
    // Initialize plot data arrays
    plotDataArrays = displayPlots.map((p) => [p.x, ...p.ys] as uPlot.AlignedData);
  });

  // Clear channel buffers when channel map changes
  $effect(() => {
    const channelMap = $deviceConsensus.channelMap.value?.varIds ?? null;
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

  // On each frame tick: update ring cursors and write frame data
  $effect(() => {
    const frameTick_ = $frameTick;
    if (frameTick_ === 0) return;

    // Read mutable state without tracking (these are plain JS objects now)
    const currentRings = rings;
    const currentDisplayPlots = displayPlots;
    const currentSessions = untrack(() => sessions);

    if (currentRings.length === 0) return;

    // Advance cursors and null out current position
    for (const ring of currentRings) {
      ring.cursor = (ring.cursor + 1) % ring.size;
      for (let c = 0; c < ring.channels; c += 1) {
        ring.data[c][ring.cursor] = null;
      }
    }

    // Write frame data from sessions
    const ringMap = new Map(currentRings.map((ring) => [ring.path, ring]));
    for (const session of currentSessions) {
      const ring = ringMap.get(session.path);
      const frame = session.frame;
      if (!ring || !frame) continue;
      for (let c = 0; c < ring.channels; c += 1) {
        ring.data[c][ring.cursor] = frame.values[c] ?? null;
      }
    }

    // Copy rotated data into stable display buffers (in-place)
    for (let c = 0; c < currentDisplayPlots.length; c += 1) {
      const plot = currentDisplayPlots[c];
      for (let r = 0; r < currentRings.length; r += 1) {
        const ring = currentRings[r];
        const src = ring.data[c];
        const dst = plot.ys[r];
        const start = (ring.cursor + 1) % ring.size;
        for (let i = 0; i < ring.size; i += 1) {
          dst[i] = src[(start + i) % ring.size];
        }
      }
    }

    // Rebuild plot data arrays (new reference triggers reactive update)
    plotDataArrays = currentDisplayPlots.map((p) => [p.x, ...p.ys] as uPlot.AlignedData);

  });
</script>

<div class="flex h-full flex-col gap-4 overflow-hidden">
  <!-- Settings buttons -->
  <div class="flex shrink-0 gap-2">
    <Button variant="outline">Channels</Button>
    <Button variant="outline">Timing</Button>
    <Button variant="outline">Trigger</Button>
    <Button variant="outline">Display</Button>
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
