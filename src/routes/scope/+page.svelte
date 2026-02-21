<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { LivePlot } from "$lib/components/liveplot";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/item";
  import ChannelsPopover from "$lib/components/scope/channels-popover.svelte";
  import TimingPopover from "$lib/components/scope/timing-popover.svelte";
  import TriggerPopover from "$lib/components/scope/trigger-popover.svelte";
  import RtBufferPopover from "$lib/components/scope/rt-buffer-popover.svelte";
  import RunStopButton from "$lib/components/scope/run-stop-button.svelte";
  import {
    clearHistoryChannels,
    createLiveHistoryState,
    ingestFrameTick,
    pruneHistoryWindow,
    reconcileHistoryDevices,
    toChannelSeries,
  } from "$lib/liveplot/history";
  import type { LiveHoverPayload, LiveSeries } from "$lib/liveplot/core";
  import { frameTick } from "$lib/store/runtime";
  import { connectedDevices } from "$lib/store/device-store";
  import {
    consensusStaticInfo,
    consensusChannelMap,
  } from "$lib/store/device-consensus";
  import { settings } from "$lib/settings";

  const MAX_CHANNEL_PLOTS = 5;
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
  const channelCount = $derived(
    Math.max(
      0,
      Math.min(
        MAX_CHANNEL_PLOTS,
        $consensusStaticInfo.value?.numChannels ?? 0,
      ),
    ),
  );

  const hasLayout = $derived.by(() => {
    const mapLen = $consensusChannelMap.value?.varIds?.length ?? 0;
    return channelCount > 0 && sessions.length > 0 && mapLen >= channelCount;
  });

  let plotTheme = $state<"light" | "dark">("dark");
  let plotsPaused = $state(false);
  let scrubTime = $state<number | null>(null);
  let loading = $state(false);
  let hasAnyData = $state(false);
  let plotSeriesByChannel = $state.raw<LiveSeries[][]>([]);
  let hoverByChannel = $state.raw<Array<LiveHoverPayload | null>>([]);

  let history = createLiveHistoryState(0);
  let colorMap: Record<string, string> = {};
  let lastChannelMap: number[] | null = null;
  let layoutKey = "";

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
      if (!colorMap[path]) colorMap[path] = pickColor();
    }
  };

  const refreshPlotSeries = (channels: number) => {
    plotSeriesByChannel = Array.from({ length: channels }, (_, channelIdx) =>
      toChannelSeries(history, channelIdx),
    );

    hoverByChannel = Array.from(
      { length: channels },
      (_, channelIdx) => hoverByChannel[channelIdx] ?? null,
    );

    hasAnyData = plotSeriesByChannel.some((series) =>
      series.some((line) => line.points.length >= 2),
    );

    loading = hasLayout && !hasAnyData;
  };

  const handleHover = (channelIdx: number, payload: LiveHoverPayload | null) => {
    if (payload) {
      hoverByChannel = hoverByChannel.map((_, idx) =>
        idx === channelIdx ? payload : null,
      );
      scrubTime = payload.time;
      return;
    }

    hoverByChannel = hoverByChannel.map((entry, idx) =>
      idx === channelIdx ? null : entry,
    );

    if (!hoverByChannel.some(Boolean)) {
      scrubTime = null;
    }
  };

  onMount(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      plotTheme = root.classList.contains("dark") ? "dark" : "light";
    };
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  });

  $effect(() => {
    const sessions_ = sessions;
    const channels = channelCount;

    if (!hasLayout) {
      layoutKey = "";
      history = createLiveHistoryState(channels);
      lastChannelMap = null;
      scrubTime = null;
      plotSeriesByChannel = [];
      hoverByChannel = [];
      hasAnyData = false;
      loading = false;
      return;
    }

    const paths = sessions_.map((session) => session.path);
    const labels = sessions_.map((session) => session.info?.deviceName ?? session.path);
    const nextLayoutKey = `${channels}:${paths.join(",")}:${labels.join(",")}`;

    if (nextLayoutKey !== layoutKey) {
      layoutKey = nextLayoutKey;
      assignColors(paths);
    }

    reconcileHistoryDevices(
      history,
      sessions_.map((session) => ({
        path: session.path,
        label: session.info?.deviceName ?? session.path,
        frameValues: session.frame?.values ?? null,
      })),
      channels,
      (path) => colorMap[path] ?? colors[0],
    );

    pruneHistoryWindow(history, Date.now() / 1000, $settings.liveBufferDurationS);
    refreshPlotSeries(channels);
  });

  $effect(() => {
    const duration = $settings.liveBufferDurationS;
    if (!hasLayout) return;

    pruneHistoryWindow(history, Date.now() / 1000, duration);
    refreshPlotSeries(channelCount);
  });

  $effect(() => {
    const channelMap = $consensusChannelMap.value?.varIds ?? null;
    if (!channelMap || !hasLayout) {
      lastChannelMap = channelMap ? [...channelMap] : null;
      return;
    }

    if (!lastChannelMap) {
      lastChannelMap = [...channelMap];
      return;
    }

    if (channelMap.length !== lastChannelMap.length) {
      const changed = Array.from({ length: channelCount }, (_, idx) => idx);
      clearHistoryChannels(history, changed);
      lastChannelMap = [...channelMap];
      refreshPlotSeries(channelCount);
      return;
    }

    const changed: number[] = [];
    for (let idx = 0; idx < Math.min(channelMap.length, channelCount); idx += 1) {
      if (channelMap[idx] !== lastChannelMap[idx]) changed.push(idx);
    }

    if (changed.length > 0) {
      clearHistoryChannels(history, changed);
      lastChannelMap = [...channelMap];
      refreshPlotSeries(channelCount);
    }
  });

  $effect(() => {
    const tick = $frameTick;
    if (tick === 0 || !hasLayout) return;

    const nowSec = Date.now() / 1000;
    const sessions_ = untrack(() => sessions);

    ingestFrameTick(
      history,
      sessions_.map((session) => ({
        path: session.path,
        label: session.info?.deviceName ?? session.path,
        frameValues: session.frame?.values ?? null,
      })),
      nowSec,
      $settings.liveBufferDurationS,
    );

    refreshPlotSeries(channelCount);
  });
</script>

<div class="flex h-full flex-col gap-4 overflow-hidden">
  <div class="flex shrink-0 items-start gap-2">
    <ChannelsPopover />
    <TimingPopover />
    <TriggerPopover />
    <RtBufferPopover />
    <Button
      variant="outline"
      disabled={!hasLayout}
      onclick={() => {
        plotsPaused = !plotsPaused;
      }}
    >
      {plotsPaused ? "Resume Plot" : "Pause Plot"}
    </Button>
    <div class="ml-auto">
      <RunStopButton />
    </div>
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
    {#if !hasLayout}
      <Item
        variant="outline"
        class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        Waiting for device frames...
      </Item>
    {:else}
      {#each Array.from({ length: channelCount }, (_, idx) => idx) as channelIdx (channelIdx)}
        <Item variant="outline" class="min-h-0 flex-1 p-0">
          <LivePlot
            class="h-full w-full"
            series={plotSeriesByChannel[channelIdx] ?? []}
            windowSecs={$settings.liveBufferDurationS}
            paused={plotsPaused}
            loading={loading}
            scrubEnabled={true}
            showGrid={true}
            showFill={true}
            scrubTime={scrubTime}
            theme={plotTheme}
            onHover={(payload) => handleHover(channelIdx, payload)}
            emptyText="No data to display"
          />
        </Item>
      {/each}
    {/if}
  </div>
</div>
