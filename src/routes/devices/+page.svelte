<script lang="ts">
  import { get } from "svelte/store";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import * as Item from "$lib/components/ui/item";
  import {
    AvailablePortsTable,
    SavedDevicesTable,
    getDeviceStatus,
  } from "$lib/components/devices-table";
  import {
    availablePortRows,
    availablePortsState,
    clearAvailableSelection,
    refreshAvailablePorts,
    savedDeviceRows,
    selectedAvailablePaths,
  } from "$lib/store/devices-ui";
  import { activatePorts, resyncPorts, addToSaved } from "$lib/runtime/devices";
  import { onMount } from "svelte";

  onMount(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshAvailablePorts();
    };

    void poll();
  });

  async function handleRefreshAvailable() {
    await refreshAvailablePorts();
  }

  function handleSelectionChange(paths: string[]) {
    selectedAvailablePaths.set(paths);
  }

  async function handleAddSelected() {
    const paths = get(selectedAvailablePaths);
    if (paths.length === 0) return;

    await addToSaved(paths);
    clearAvailableSelection();

    try {
      await activatePorts(paths);
    } catch (error) {
      console.info("connect attempt failed", error);
    }
  }

  async function handleResyncAll() {
    await refreshAvailablePorts();
    const saved = get(savedDeviceRows);
    const available = new Set(
      get(availablePortsState).ports.map((port) => port.path),
    );
    const targets = saved
      .filter(
        (row) =>
          row.isActive &&
          getDeviceStatus(row.session, row.isActive) === "error" &&
          available.has(row.port.path),
      )
      .map((row) => row.port.path);

    if (targets.length === 0) return;
    try {
      await resyncPorts(targets);
    } catch (error) {
      console.info("resync failed", error);
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col gap-6">
  <header>
    <h1 class="text-xl font-semibold text-foreground">Devices</h1>
  </header>

  <div class="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
    <Item.Root
      variant="outline"
      class="flex h-full min-h-0 flex-1 flex-col flex-nowrap items-stretch gap-4"
    >
      <Item.Header>
        <Item.Title>Saved Devices</Item.Title>
        <Item.Actions>
          <Button size="sm" variant="outline" onclick={handleResyncAll}
            >Resync All</Button
          >
        </Item.Actions>
      </Item.Header>
      <Item.Content class="min-h-0 flex-1 overflow-hidden">
        <SavedDevicesTable devices={$savedDeviceRows} />
      </Item.Content>
    </Item.Root>

    <Item.Root
      variant="outline"
      class="flex h-full min-h-0 flex-1 flex-col flex-nowrap items-stretch gap-4"
    >
      <Item.Header>
        <Item.Title>Available Ports</Item.Title>
        <Item.Actions>
          <Button size="sm" variant="outline" onclick={handleRefreshAvailable}
            >Refresh</Button
          >
          <Button
            size="sm"
            onclick={handleAddSelected}
            disabled={$selectedAvailablePaths.length === 0}
          >
            Add
          </Button>
        </Item.Actions>
      </Item.Header>
      <Item.Content class="min-h-0 flex-1 overflow-hidden">
        {#if $availablePortsState.status === "loading"}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner class="size-4" />
            Listing devices...
          </div>
        {:else if $availablePortsState.status === "error"}
          <div
            class="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4"
          >
            <div class="text-sm text-destructive">Failed to list devices.</div>
            {#if $availablePortsState.error}
              <div class="text-xs text-destructive/80">
                {$availablePortsState.error}
              </div>
            {/if}
            <div>
              <Button
                variant="outline"
                size="sm"
                onclick={handleRefreshAvailable}
              >
                Retry
              </Button>
            </div>
          </div>
        {:else if $availablePortsState.status === "ready" && $availablePortRows.length === 0}
          <div
            class="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-sm text-muted-foreground"
          >
            <div>No devices found.</div>
            <Button
              variant="outline"
              size="sm"
              onclick={handleRefreshAvailable}
            >
              Refresh
            </Button>
          </div>
        {:else if $availablePortsState.status === "ready"}
          <AvailablePortsTable
            ports={$availablePortRows}
            selectedPaths={$selectedAvailablePaths}
            onSelectionChange={handleSelectionChange}
          />
        {:else}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner class="size-4" />
            Listing devices...
          </div>
        {/if}
      </Item.Content>
    </Item.Root>
  </div>
</div>
