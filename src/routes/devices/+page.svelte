<script lang="ts">
  import { get } from "svelte/store";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import SettingsModal from "$lib/components/settings-modal.svelte";
  import {
    AvailablePortsTable,
    SavedDevicesTable,
    getDeviceStatus,
    type SavedDeviceRow,
  } from "$lib/components/devices-table";
  import {
    availablePortRows,
    availablePortsState,
    clearAvailableSelection,
    refreshAvailablePorts,
    savedDeviceRows,
    selectedAvailablePaths,
  } from "$lib/store/devices-ui";
  import { activePorts, removeSavedPorts, setActivePorts } from "$lib/ports";
  import {
    activatePorts,
    deactivatePorts,
    resyncPorts,
    addToSaved,
  } from "$lib/runtime/devices";

  let addModalOpen = $state(false);
  let settingsOpen = $state(false);
  let settingsSection = $state<"serial" | null>(null);

  $effect(() => {
    if (!settingsOpen) {
      settingsSection = null;
    }
  });

  $effect(() => {
    if (!addModalOpen) {
      clearAvailableSelection();
    }
  });

  async function openAddModal() {
    addModalOpen = true;
    await refreshAvailablePorts();
  }

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
    addModalOpen = false;

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

  function openSerialSettings() {
    settingsSection = "serial";
    settingsOpen = true;
  }

  function handleShowInfo(row: SavedDeviceRow) {
    console.info("show device info", row);
  }

  function handleEditSettings(row: SavedDeviceRow) {
    console.info("edit serial settings", row);
    openSerialSettings();
  }

  async function handleRetryConnect(row: SavedDeviceRow) {
    try {
      await resyncPorts([row.port.path]);
    } catch (error) {
      console.info("retry connect failed", error);
    }
  }

  async function handleToggleActive(row: SavedDeviceRow) {
    const current = new Set(get(activePorts));
    if (row.isActive) {
      current.delete(row.port.path);
      await setActivePorts(Array.from(current));
      try {
        await deactivatePorts([row.port.path]);
      } catch (error) {
        console.info("disconnect failed", error);
      }
    } else {
      current.add(row.port.path);
      await setActivePorts(Array.from(current));
      try {
        await activatePorts([row.port.path]);
      } catch (error) {
        console.info("connect failed", error);
      }
    }
  }

  async function handleRemove(row: SavedDeviceRow) {
    const path = row.port.path;
    await removeSavedPorts([path]);
    await setActivePorts(get(activePorts).filter((entry) => entry !== path));
  }
</script>

<div class="flex flex-col gap-6">
  <header
    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
  >
    <div class="space-y-1">
      <h1 class="text-xl font-semibold text-foreground">Devices</h1>
      <p class="text-sm text-muted-foreground">
        Manage saved devices, monitor status, and control activation.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button onclick={openAddModal}>Add Devices</Button>
      <Button variant="outline" onclick={handleResyncAll}>Resync All</Button>
      <Button variant="outline" onclick={openSerialSettings}>
        Default Serial Settings
      </Button>
    </div>
  </header>

  <section class="rounded-xl border border-border/70 bg-card p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-medium text-foreground">Saved Devices</h2>
    </div>

    <SavedDevicesTable
      devices={$savedDeviceRows}
      onShowInfo={handleShowInfo}
      onEditSettings={handleEditSettings}
      onRetryConnect={handleRetryConnect}
      onToggleActive={handleToggleActive}
      onRemove={handleRemove}
    />
  </section>
</div>

<Dialog.Root bind:open={addModalOpen}>
  <Dialog.Content class="max-h-[90vh] max-w-4xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Add Devices</Dialog.Title>
      <Dialog.Description>
        Select one or more ports to save and connect.
      </Dialog.Description>
    </Dialog.Header>

    <div class="py-4">
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
          <Button variant="outline" size="sm" onclick={handleRefreshAvailable}>
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
    </div>

    <Dialog.Footer
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="text-xs text-muted-foreground">
        {$selectedAvailablePaths.length} selected
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={handleRefreshAvailable}>
          Refresh
        </Button>
        <Button
          onclick={handleAddSelected}
          disabled={$selectedAvailablePaths.length === 0}
        >
          Add
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<SettingsModal bind:open={settingsOpen} initialSection={settingsSection} />
