<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { activatePorts, deactivatePorts, removeSaved } from "$lib/runtime";
  import type { SavedDeviceRow } from "./types.js";

  type Props = {
    row: SavedDeviceRow;
  };

  let { row }: Props = $props();

  const handleToggleActive = async () => {
    if (row.isActive) {
      await deactivatePorts([row.port.path]);
    } else {
      await activatePorts([row.port.path]);
    }
  };

  const handleDelete = async () => {
    await removeSaved([row.port.path]);
  };
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button variant="ghost" size="icon" class="size-8" {...props}>
        <EllipsisVertical class="size-4" />
        <span class="sr-only">Open menu</span>
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Item onclick={handleToggleActive}>
      {row.isActive ? "Deactivate" : "Activate"}
    </DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onclick={handleDelete} class="text-destructive">
      Delete
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
