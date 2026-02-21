<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import {
    createLivePlotEngine,
    type LiveChartConfig,
    type LiveHoverPayload,
    type LivePlotEngine,
    type LiveSeries,
  } from "$lib/liveplot/core";
  import { cn } from "$lib/utils";

  type Props = {
    series: LiveSeries[];
    windowSecs: number;
    paused?: boolean;
    loading?: boolean;
    emptyText?: string;
    scrubTime?: number | null;
    showGrid?: boolean;
    showFill?: boolean;
    scrubEnabled?: boolean;
    class?: string;
    theme?: "light" | "dark";
    onHover?: (payload: LiveHoverPayload | null) => void;
  };

  let {
    series,
    windowSecs,
    paused = false,
    loading = false,
    emptyText = "No data to display",
    scrubTime = null,
    showGrid = true,
    showFill = true,
    scrubEnabled = true,
    class: className,
    theme = "dark",
    onHover,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let engine: LivePlotEngine | null = null;

  const buildConfig = (): LiveChartConfig => ({
    series,
    windowSecs,
    paused,
    loading,
    emptyText,
    scrubTime,
    showGrid,
    showFill,
    scrubEnabled,
    theme,
    onHover,
  });

  $effect(() => {
    if (!container || !canvas) return;

    engine = createLivePlotEngine(canvas, container, untrack(buildConfig));

    return () => {
      engine?.destroy();
      engine = null;
    };
  });

  $effect(() => {
    engine?.setConfig(buildConfig());
  });

  $effect(() => {
    engine?.setScrubTime(scrubTime);
  });

  onDestroy(() => {
    engine?.destroy();
    engine = null;
  });
</script>

<div bind:this={container} class={cn("relative h-full w-full", className)}>
  <canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
