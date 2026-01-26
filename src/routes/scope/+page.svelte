<script lang="ts">
  import { Plot } from "$lib/components/plot";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/item";
  import { frameTick, compatibleSessions } from "$lib/store/runtime";
  import { settings } from "$lib/settings";
  import type uPlot from "uplot";
  import { SvelteSet } from "svelte/reactivity";

  type FrameRing = {
    path: string;
    label: string;
    color: string;
    size: number;
    channels: number;
    frameHz: number;
    cursor: number;
    x: number[];
    data: Array<Array<number | null>>;
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

  const sessions = $derived($compatibleSessions);

  const ringConfig = $derived({
    frameHz: $settings.framePollingHz,
    durationS: $settings.liveBufferDurationS,
    channels: sessions[0]?.info?.numChannels ?? 0,
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
    x: Array.from({ length: size }, (_, index) => index / frameHz),
    data: Array.from({ length: channels }, () =>
      Array.from({ length: size }, () => null),
    ),
  });

  const rotate = <T,>(values: T[], cursor: number): T[] => {
    if (values.length === 0) return values;
    const start = (cursor + 1) % values.length;
    return values.slice(start).concat(values.slice(0, start));
  };

  let rings = $state<FrameRing[]>([]);
  let colorMap = $state<Record<string, string>>({});

  const assignColors = (paths: string[]) => {
    const next = { ...colorMap };
    const used = new SvelteSet<string>();
    for (const path of paths) {
      const color = next[path];
      if (color) used.add(color);
    }
    let paletteIndex = 0;
    const pickColor = () => {
      while (paletteIndex < colors.length && used.has(colors[paletteIndex])) {
        paletteIndex += 1;
      }
      if (paletteIndex < colors.length) {
        const color = colors[paletteIndex];
        paletteIndex += 1;
        used.add(color);
        return color;
      }
      const color = colors[paths.length % colors.length];
      used.add(color);
      return color;
    };
    for (const path of paths) {
      if (!next[path]) {
        next[path] = pickColor();
      }
    }
    colorMap = next;
  };

  $effect(() => {
    const paths = sessions.map((s) => s.path);
    if (paths.length === 0) return;
    assignColors(paths);
  });

  $effect(() => {
    const { size, channels, frameHz } = ringConfig;
    const paths = sessions.map((s) => s.path);
    if (channels <= 0 || paths.length === 0) {
      rings = [];
      return;
    }
    const existing = new Map(rings.map((ring) => [ring.path, ring]));
    const next: FrameRing[] = [];
    for (const session of sessions) {
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
  });

  $effect(() => {
    const tick = $frameTick;
    if (tick === 0) return;
    for (const ring of rings) {
      ring.cursor = (ring.cursor + 1) % ring.size;
      for (let c = 0; c < ring.channels; c += 1) {
        ring.data[c][ring.cursor] = null;
      }
    }
  });

  $effect(() => {
    const ringMap = new Map(rings.map((ring) => [ring.path, ring]));
    for (const session of sessions) {
      const ring = ringMap.get(session.path);
      const frame = session.frame;
      if (!ring || !frame) continue;
      for (let c = 0; c < ring.channels; c += 1) {
        ring.data[c][ring.cursor] = frame.values[c] ?? null;
      }
    }
  });

  type ChannelPlot = {
    data: uPlot.AlignedData;
    series: uPlot.Series[];
  };

  const buildChannelPlots = (
    currentRings: FrameRing[],
    channelCount: number,
  ): ChannelPlot[] => {
    if (currentRings.length === 0 || channelCount <= 0) return [];
    const x = currentRings[0].x;
    const plots: ChannelPlot[] = [];
    for (let c = 0; c < channelCount; c += 1) {
      const ys = currentRings.map((ring) => rotate(ring.data[c], ring.cursor));
      plots.push({
        data: [x, ...ys],
        series: currentRings.map((ring) => ({
          label: ring.label,
          stroke: ring.color,
        })),
      });
    }
    return plots;
  };

  const channelPlots = $derived(buildChannelPlots(rings, ringConfig.channels));
</script>

<div class="flex h-full flex-col gap-4">
  <!-- Settings buttons -->
  <div class="flex gap-2">
    <Button variant="outline">Channels</Button>
    <Button variant="outline">Timing</Button>
    <Button variant="outline">Trigger</Button>
    <Button variant="outline">Display</Button>
  </div>

  <!-- 5 channel plots, stacked with shared x-axis -->
  <div class="flex min-h-0 flex-1 flex-col gap-1">
    {#if channelPlots.length === 0}
      <Item
        variant="outline"
        class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        Waiting for device frames...
      </Item>
    {:else}
      {#each channelPlots as plot, i (i)}
        <Item variant="outline" class="min-h-0 flex-1 p-0">
          <Plot
            data={plot.data}
            series={plot.series}
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
