<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { connectedDevices } from "$lib/store/device-store";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  type RtEntry = {
    name: string;
    value: number | null;
    index: number | null;
  };

  const consensus = $derived($deviceConsensus);
  const sessions = $derived($connectedDevices);
  const permissions = $derived($runtimeCommandPermissions);

  const entries = $derived.by((): RtEntry[] => {
    if (consensus.rt.entries.length > 0) {
      return consensus.rt.entries.map((entry) => ({
        name: entry.name,
        value: entry.value,
        index: null,
      }));
    }

    if (sessions.length !== 1) return [];

    const device = sessions[0];
    const count = device.info?.rtCount ?? 0;
    const names = device.catalog.rtLabels?.entries ?? [];

    return Array.from({ length: count }, (_, index) => ({
      name: names[index] ?? `RT ${index + 1}`,
      value: device.rtBuffers.get(index)?.value ?? null,
      index,
    }));
  });
  const disabled = $derived(!permissions.setRtBuffer || entries.length === 0);

  const resolveIndex = (entry: RtEntry): number | null => {
    if (entry.index !== null) return entry.index;
    // Use any device's name→idx map (catalogs enforced aligned)
    for (const map of consensus.rt.nameToIdxByDevice.values()) {
      const idx = map.get(entry.name);
      if (idx !== undefined) return idx;
    }
    return null;
  };

  const handleValueCommit = (entry: RtEntry, value: number) => {
    const index = resolveIndex(entry);
    if (index === null) return;
    enqueueGuardedCommand({ type: "setRtBuffer", index, value });
  };

  const handleKeydown = (e: KeyboardEvent, entry: RtEntry) => {
    if (e.key === "Enter") {
      const target = e.currentTarget as HTMLInputElement;
      handleValueCommit(entry, parseFloat(target.value) || 0);
    }
  };

  const handleBlur = (e: FocusEvent, entry: RtEntry) => {
    const target = e.currentTarget as HTMLInputElement;
    handleValueCommit(entry, parseFloat(target.value) || 0);
  };
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" {...props}>RT Buffer</Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-[420px]">
    <div class="flex flex-col gap-3">
      <h4 class="text-sm font-medium">RT Buffer</h4>
      {#if entries.length === 0}
        <p class="text-xs text-muted-foreground">No RT buffer entries</p>
      {:else}
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          {#each entries as entry (entry.index ?? entry.name)}
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 truncate text-xs text-muted-foreground" title={entry.name}>
                {entry.name}
              </span>
              <Input
                type="number"
                step="any"
                class="h-7 text-xs"
                value={entry.value ?? 0}
                {disabled}
                onkeydown={(e) => handleKeydown(e, entry)}
                onblur={(e) => handleBlur(e, entry)}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
