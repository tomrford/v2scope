<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const consensus = $derived($deviceConsensus);
  const permissions = $derived($runtimeCommandPermissions);

  const entries = $derived(consensus.rt.entries);
  const disabled = $derived(!permissions.setRtBuffer || !consensus.rt.ready);

  const resolveIndex = (name: string): number | null => {
    // Use any device's name→idx map (catalogs enforced aligned)
    for (const map of consensus.rt.nameToIdxByDevice.values()) {
      const idx = map.get(name);
      if (idx !== undefined) return idx;
    }
    return null;
  };

  const handleValueCommit = (name: string, value: number) => {
    const index = resolveIndex(name);
    if (index === null) return;
    enqueueGuardedCommand({ type: "setRtBuffer", index, value });
  };

  const handleKeydown = (e: KeyboardEvent, name: string) => {
    if (e.key === "Enter") {
      const target = e.currentTarget as HTMLInputElement;
      handleValueCommit(name, parseFloat(target.value) || 0);
    }
  };

  const handleBlur = (e: FocusEvent, name: string) => {
    const target = e.currentTarget as HTMLInputElement;
    handleValueCommit(name, parseFloat(target.value) || 0);
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
          {#each entries as entry, i (i)}
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
                onkeydown={(e) => handleKeydown(e, entry.name)}
                onblur={(e) => handleBlur(e, entry.name)}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
