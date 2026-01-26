<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import MoreHorizontal from "@lucide/svelte/icons/ellipsis";
  import Info from "@lucide/svelte/icons/info";
  import Settings from "@lucide/svelte/icons/settings";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Power from "@lucide/svelte/icons/power";
  import PowerOff from "@lucide/svelte/icons/power-off";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { type SavedDeviceRow, getDeviceStatus } from "./types.js";

  type Props = {
    row: SavedDeviceRow;
    onShowInfo?: (row: SavedDeviceRow) => void;
    onEditSettings?: (row: SavedDeviceRow) => void;
    onRetryConnect?: (row: SavedDeviceRow) => void;
    onToggleActive?: (row: SavedDeviceRow) => void;
    onRemove?: (row: SavedDeviceRow) => void;
  };

  let { row, onShowInfo, onEditSettings, onRetryConnect, onToggleActive, onRemove }: Props =
    $props();

  const status = $derived(getDeviceStatus(row.session, row.isActive));
  const canShowInfo = $derived(status === "connected" && row.session?.info);
  const canRetry = $derived(status === "error" || status === "unknown");
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <Button variant="ghost" size="icon" class="h-8 w-8">
      <MoreHorizontal class="h-4 w-4" />
      <span class="sr-only">Open menu</span>
    </Button>
  </ContextMenu.Trigger>
  <ContextMenu.Content class="w-48">
    {#if canShowInfo && onShowInfo}
      <ContextMenu.Item onclick={() => onShowInfo(row)}>
        <Info class="mr-2 h-4 w-4" />
        Show Device Info
      </ContextMenu.Item>
    {/if}
    {#if onEditSettings}
      <ContextMenu.Item onclick={() => onEditSettings(row)}>
        <Settings class="mr-2 h-4 w-4" />
        Edit Serial Settings
      </ContextMenu.Item>
    {/if}
    {#if canRetry && onRetryConnect}
      <ContextMenu.Item onclick={() => onRetryConnect(row)}>
        <RefreshCw class="mr-2 h-4 w-4" />
        Retry Connect
      </ContextMenu.Item>
    {/if}
    {#if onToggleActive}
      <ContextMenu.Item onclick={() => onToggleActive(row)}>
        {#if row.isActive}
          <PowerOff class="mr-2 h-4 w-4" />
          Deactivate
        {:else}
          <Power class="mr-2 h-4 w-4" />
          Activate
        {/if}
      </ContextMenu.Item>
    {/if}
    {#if onRemove}
      <ContextMenu.Separator />
      <ContextMenu.Item onclick={() => onRemove(row)} class="text-destructive">
        <Trash2 class="mr-2 h-4 w-4" />
        Remove
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
