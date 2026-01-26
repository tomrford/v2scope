<script lang="ts">
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { cn } from "$lib/utils";
  import type { PlotProps } from "./types";

  let {
    data,
    series = [],
    width,
    height,
    interactive = false,
    xLabel,
    yLabel,
    class: className,
    syncKey,
    showXAxis = true,
    showLegend = true,
    showCursor = true,
  }: PlotProps = $props();

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  const effectiveWidth = $derived(width ?? containerWidth);
  const effectiveHeight = $derived(height ?? containerHeight);

  // Build options reactively
  const options = $derived<uPlot.Options>({
    width: effectiveWidth,
    height: effectiveHeight,
    legend: { show: showLegend },
    cursor: {
      show: showCursor,
      drag: { x: interactive, y: interactive },
      sync: syncKey ? { key: syncKey } : undefined,
    },
    scales: {
      x: { time: false },
    },
    axes: [
      {
        show: showXAxis,
        label: xLabel,
        grid: { show: true },
        ticks: { show: showXAxis },
        size: showXAxis ? undefined : 0,
      },
      { label: yLabel },
    ],
    series: [{ label: xLabel ?? "x" }, ...series],
  });

  // ResizeObserver for container dimensions
  $effect(() => {
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      containerWidth = entries[0].contentRect.width;
      containerHeight = entries[0].contentRect.height;
    });
    ro.observe(container);
    return () => ro.disconnect();
  });

  // Create chart once we have dimensions
  $effect(() => {
    if (!container || effectiveWidth === 0 || effectiveHeight === 0) return;

    if (!chart) {
      chart = new uPlot(options, data, container);
    }

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  // Update data when it changes
  $effect(() => {
    if (chart && data) {
      chart.setData(data);
    }
  });

  // Handle resize
  $effect(() => {
    if (chart && effectiveWidth > 0 && effectiveHeight > 0) {
      chart.setSize({ width: effectiveWidth, height: effectiveHeight });
    }
  });
</script>

<div bind:this={container} class={cn("w-full", className)}></div>
