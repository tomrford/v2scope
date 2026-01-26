<script lang="ts" module>
  export type StatusBadgeTone = "connected" | "error" | "disconnected";
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    label,
    tone = "connected",
    class: className,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
    label: string;
    tone?: StatusBadgeTone;
  } = $props();

  const dotClass = $derived(
    tone === "connected"
      ? "bg-green-500"
      : tone === "error"
        ? "bg-red-500"
        : "bg-gray-400",
  );
</script>

<span
  bind:this={ref}
  class={cn(
    "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground",
    className,
  )}
  {...restProps}
>
  <span class={cn("h-2 w-2 rounded-full", dotClass)}></span>
  {label}
</span>
