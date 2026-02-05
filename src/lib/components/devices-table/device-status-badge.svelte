<script lang="ts">
  import * as HoverCard from "$lib/components/ui/hover-card";
  import StatusBadge from "$lib/components/ui/badge/status-badge.svelte";
  import Settings from "@lucide/svelte/icons/settings";
  import type { RuntimeDeviceError } from "$lib/runtime";
  import type { DeviceStatus } from "./types.js";

  type DeviceStatusError =
    | RuntimeDeviceError
    | { type: "mismatch"; message: string };

  type Props = {
    status: DeviceStatus;
    error?: DeviceStatusError | null;
    hasOverride?: boolean;
  };

  let { status, error, hasOverride = false }: Props = $props();

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

  type ErrorDetails = {
    title: string;
    detail?: string;
  };

  const toDeviceErrorDetails = (
    err: DeviceStatusError | null,
  ): ErrorDetails | null => {
    if (!err) return null;
    if (err.type === "mismatch") {
      return { title: "Device mismatch", detail: err.message };
    }

    const deviceError = err.error as Record<string, unknown> & {
      _tag?: string;
    };
    const tag =
      typeof deviceError._tag === "string" ? deviceError._tag : "DeviceError";

    switch (tag) {
      case "PortNotFound":
        return {
          title: "Port not found",
          detail: String(deviceError.path ?? "unknown"),
        };
      case "PortBusy":
        return {
          title: "Port busy",
          detail: String(deviceError.path ?? "unknown"),
        };
      case "InvalidHandle":
        return {
          title: "Invalid handle",
          detail: `Handle ${String(deviceError.handleId ?? "unknown")}`,
        };
      case "Timeout":
        return { title: "Timeout" };
      case "CrcMismatch":
        return { title: "CRC mismatch" };
      case "IoError":
        return {
          title: "I/O error",
          detail: String(deviceError.message ?? "unknown error"),
        };
      case "InvalidConfig":
        return {
          title: "Invalid config",
          detail: String(deviceError.message ?? "unknown config"),
        };
      case "PayloadTooLarge":
        return { title: "Payload too large" };
      case "BadLen":
        return { title: "Bad length" };
      case "BadParam":
        return { title: "Bad parameter" };
      case "Range":
        return { title: "Out of range" };
      case "NotReady":
        return { title: "Not ready" };
      case "DecodeError":
        return {
          title: "Decode error",
          detail: String(deviceError.message ?? "unknown error"),
        };
      default:
        return { title: "Device error", detail: tag };
    }
  };

  const errorDetails = $derived(toDeviceErrorDetails(error ?? null));
</script>

{#if config}
  {#if status === "error" && errorDetails}
    <HoverCard.Root>
      <HoverCard.Trigger>
        <span class="inline-flex items-center gap-1">
          {#if hasOverride}
            <Settings
              class="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          {/if}
          <StatusBadge tone={config.tone} label={config.label} />
        </span>
      </HoverCard.Trigger>
      <HoverCard.Content align="start" class="w-72">
        <div class="grid gap-1">
          <div class="text-sm font-medium text-foreground">
            {errorDetails.title}
          </div>
          {#if errorDetails.detail}
            <div class="text-xs text-muted-foreground">
              {errorDetails.detail}
            </div>
          {/if}
        </div>
      </HoverCard.Content>
    </HoverCard.Root>
  {:else}
    <span class="inline-flex items-center gap-1">
      {#if hasOverride}
        <Settings class="size-3.5 text-muted-foreground" aria-hidden="true" />
      {/if}
      <StatusBadge tone={config.tone} label={config.label} />
    </span>
  {/if}
{/if}
