<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import MoreHorizontal from "@lucide/svelte/icons/ellipsis";
  import LineChart from "@lucide/svelte/icons/chart-line";
  import GitCompare from "@lucide/svelte/icons/git-compare-arrows";
  import Save from "@lucide/svelte/icons/save";
  import Download from "@lucide/svelte/icons/download";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Pencil from "@lucide/svelte/icons/pencil";
  import type { SnapshotEntry } from "$lib/store/snapshots.js";

  type Props = {
    entry: SnapshotEntry;
    onPlot?: (entry: SnapshotEntry) => void;
    onCompare?: (entry: SnapshotEntry) => void;
    onSave?: (entry: SnapshotEntry) => void;
    onExport?: (entry: SnapshotEntry) => void;
    onDelete?: (entry: SnapshotEntry) => void;
    onRename?: (entry: SnapshotEntry) => void;
  };

  let {
    entry,
    onPlot,
    onCompare,
    onSave,
    onExport,
    onDelete,
    onRename,
  }: Props = $props();
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <Button variant="ghost" size="icon" class="h-8 w-8">
      <MoreHorizontal class="h-4 w-4" />
      <span class="sr-only">Open menu</span>
    </Button>
  </ContextMenu.Trigger>
  <ContextMenu.Content class="w-48">
    {#if onPlot}
      <ContextMenu.Item onclick={() => onPlot(entry)}>
        <LineChart class="mr-2 h-4 w-4" />
        Plot
      </ContextMenu.Item>
    {/if}
    {#if onCompare}
      <ContextMenu.Item onclick={() => onCompare(entry)}>
        <GitCompare class="mr-2 h-4 w-4" />
        Compare
      </ContextMenu.Item>
    {/if}
    {#if onRename}
      <ContextMenu.Item onclick={() => onRename(entry)}>
        <Pencil class="mr-2 h-4 w-4" />
        Rename
      </ContextMenu.Item>
    {/if}
    {#if !entry.persisted && onSave}
      <ContextMenu.Item onclick={() => onSave(entry)}>
        <Save class="mr-2 h-4 w-4" />
        Save
      </ContextMenu.Item>
    {/if}
    {#if onExport}
      <ContextMenu.Item onclick={() => onExport(entry)}>
        <Download class="mr-2 h-4 w-4" />
        Export
      </ContextMenu.Item>
    {/if}
    {#if onDelete}
      <ContextMenu.Separator />
      <ContextMenu.Item
        onclick={() => onDelete(entry)}
        class="text-destructive"
      >
        <Trash2 class="mr-2 h-4 w-4" />
        Delete
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
