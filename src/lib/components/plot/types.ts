import type uPlot from "uplot";

export type PlotProps = {
  /** Data: uPlot format [xValues, ...ySeriesArrays] */
  data: uPlot.AlignedData;

  /** Series config (labels, colors, line styles) */
  series?: uPlot.Series[];

  /** Width in pixels (defaults to container width) */
  width?: number;

  /** Height in pixels */
  height?: number;

  /** false=live (no zoom), true=static (zoom/pan) */
  interactive?: boolean;

  /** X-axis label */
  xLabel?: string;

  /** Y-axis label */
  yLabel?: string;

  /** Additional CSS classes for container */
  class?: string;

  /** Sync key for cursor sync across multiple charts */
  syncKey?: string;

  /** Show x-axis labels/ticks (set false for stacked charts except bottom) */
  showXAxis?: boolean;

  /** Show legend below chart */
  showLegend?: boolean;

  /** Show cursor crosshair overlay */
  showCursor?: boolean;

};
