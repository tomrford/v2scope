<script lang="ts">
  import StatusBadge from "$lib/components/ui/badge/status-badge.svelte";
  import Settings from "@lucide/svelte/icons/settings";
  import type { DeviceStatus } from "./types.js";

  type Props = {
    status: DeviceStatus;
    errorMessage?: string | null;
    hasOverride?: boolean;
  };

  let { status, errorMessage, hasOverride = false }: Props = $props();

  const statusConfig: Record<
    DeviceStatus,
    { label: string; tone: "connected" | "error" | "disconnected" } | null
  > = {
    connected: { label: "Connected", tone: "connected" },
    error: { label: "Error", tone: "error" },
    deactivated: { label: "Deactivated", tone: "disconnected" },
    unknown: null,
  };

  const config = $derived(statusConfig[status]);
</script>

{#if config}
  <span
    class="inline-flex items-center gap-1"
    title={status === "error" && errorMessage ? errorMessage : undefined}
  >
    {#if hasOverride}
      <Settings class="size-3.5 text-muted-foreground" aria-hidden="true" />
    {/if}
    <StatusBadge tone={config.tone} label={config.label} />
  </span>
{/if}
