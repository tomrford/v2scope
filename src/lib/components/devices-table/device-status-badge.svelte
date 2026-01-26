<script lang="ts">
  import StatusBadge from "$lib/components/ui/badge/status-badge.svelte";
  import type { DeviceStatus } from "./types.js";

  type Props = {
    status: DeviceStatus;
    errorMessage?: string | null;
  };

  let { status, errorMessage }: Props = $props();

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
  <span title={status === "error" && errorMessage ? errorMessage : undefined}>
    <StatusBadge tone={config.tone} label={config.label} />
  </span>
{/if}
