<script lang="ts">
  import { dev } from "$app/environment";
  import { get } from "svelte/store";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
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
  import { connectedDevices } from "$lib/store/device-store";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import {
    runtimeCommandPermissions,
    runtimeControlMode,
    runtimePolicyFacts,
  } from "$lib/store/runtime-policy.svelte";
  import { runtimeMismatches } from "$lib/store/runtime-warnings";
  import {
    clearRuntimeLogs,
    runtimeLogs,
  } from "$lib/store/runtime-logs";
  import { activatePorts, resyncPorts, addToSaved } from "$lib/runtime/devices";
  import { onMount } from "svelte";

  const AVAILABLE_PORT_POLL_MS = 2_000;

  let showConsensus = $state(false);
  let showLogs = $state(false);

  const toJson = (value: unknown): string => JSON.stringify(value, null, 2);
  const formatTime = (at: number): string =>
    new Date(at).toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const connectedDeviceDebug = $derived(
    $connectedDevices.map((device) => ({
      path: device.path,
      status: device.status,
      info: device.info
        ? {
            deviceName: device.info.deviceName,
            numChannels: device.info.numChannels,
            varCount: device.info.varCount,
            rtCount: device.info.rtCount,
            nameLen: device.info.nameLen,
            endianness: device.info.endianness,
          }
        : null,
      sync: device.sync,
      updatedAt: {
        varList: device.updatedAt.varList ?? null,
        rtLabels: device.updatedAt.rtLabels ?? null,
      },
      catalog: {
        varList: device.catalog.varList,
        rtLabels: device.catalog.rtLabels,
      },
      rtBuffers: Array.from(device.rtBuffers.entries()).map(([idx, value]) => ({
        idx,
        value: value.value,
      })),
      deviceError: device.deviceError,
    })),
  );

  onMount(() => {
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      if (document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await refreshAvailablePorts();
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), AVAILABLE_PORT_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

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
          {#if dev}
            <Dialog.Root bind:open={showConsensus}>
              <Dialog.Trigger>
                {#snippet child({ props })}
                  <Button size="sm" variant="outline" {...props}
                    >Show Consensus</Button
                  >
                {/snippet}
              </Dialog.Trigger>
              <Dialog.Content class="flex h-[85svh] max-w-4xl flex-col overflow-hidden">
                <Dialog.Header>
                  <Dialog.Title>Consensus Debug</Dialog.Title>
                  <Dialog.Description>
                    Derived runtime/consensus state. Read-only.
                  </Dialog.Description>
                </Dialog.Header>
                <div class="min-h-0 flex-1 overflow-y-auto">
                  <div class="grid gap-3 text-xs">
                    <section class="grid gap-2 rounded border p-3">
                      <div class="font-medium">Runtime</div>
                      <div class="grid grid-cols-2 gap-2">
                        <div>Connected devices: {$connectedDevices.length}</div>
                        <div>Control mode: {$runtimeControlMode}</div>
                      </div>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        runtimePolicyFacts
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($runtimePolicyFacts)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        runtimeCommandPermissions
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($runtimeCommandPermissions)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        runtimeMismatches
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($runtimeMismatches)}</pre>
                    </section>

                    <section class="grid gap-2 rounded border p-3">
                      <div class="font-medium">Completeness + Alignment</div>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.completeness
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.completeness)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.mismatches
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.mismatches)}</pre>
                      <div>
                        static mismatches: {Array.from(
                          $deviceConsensus.staticInfo.mismatches.entries(),
                        ).length}
                      </div>
                    </section>

                    <section class="grid gap-2 rounded border p-3">
                      <div class="font-medium">Consensus Values</div>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.state
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.state)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.timing
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.timing)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.trigger
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.trigger)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.channelMap
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.channelMap)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.variables
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.variables)}</pre>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        deviceConsensus.rt
                      </div>
                      <pre class="max-h-40 overflow-auto rounded bg-muted/40 p-2">{toJson($deviceConsensus.rt)}</pre>
                    </section>

                    <section class="grid gap-2 rounded border p-3">
                      <div class="font-medium">Per-Device Raw Data</div>
                      <div class="font-mono text-[11px] text-muted-foreground">
                        connectedDevices (catalog, sync, counts, rt buffers)
                      </div>
                      <pre class="max-h-80 overflow-auto rounded bg-muted/40 p-2">{toJson(connectedDeviceDebug)}</pre>
                    </section>
                  </div>
                </div>
                <Dialog.Footer>
                  <Button variant="outline" onclick={() => (showConsensus = false)}
                    >Close</Button
                  >
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root bind:open={showLogs}>
              <Dialog.Trigger>
                {#snippet child({ props })}
                  <Button size="sm" variant="outline" {...props}>Show Logs</Button>
                {/snippet}
              </Dialog.Trigger>
              <Dialog.Content class="flex h-[75svh] max-w-3xl flex-col overflow-hidden">
                <Dialog.Header>
                  <Dialog.Title>Runtime Logs</Dialog.Title>
                  <Dialog.Description>
                    FIFO buffer (max 200 lines). Service-level TX events.
                  </Dialog.Description>
                </Dialog.Header>
                <div class="min-h-0 flex-1 overflow-y-auto rounded border bg-muted/20 p-2">
                  {#if $runtimeLogs.length === 0}
                    <div class="p-2 text-xs text-muted-foreground">No logs yet.</div>
                  {:else}
                    <div class="space-y-1 font-mono text-xs">
                      {#each $runtimeLogs as line, index (`${line.at}:${index}`)}
                        <div class="rounded bg-background/80 px-2 py-1">
                          <span class="text-muted-foreground">{formatTime(line.at)}</span>
                          <span class="ml-2">{line.message}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
                <Dialog.Footer>
                  <Button
                    variant="outline"
                    onclick={() => clearRuntimeLogs()}
                    disabled={$runtimeLogs.length === 0}
                  >
                    Clear
                  </Button>
                  <Button variant="outline" onclick={() => (showLogs = false)}
                    >Close</Button
                  >
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Root>
          {/if}
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
          </div>
        {:else if $availablePortsState.status === "ready" && $availablePortRows.length === 0}
          <div class="rounded-md border border-dashed p-8 text-sm text-muted-foreground">
            <div>No devices found.</div>
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
