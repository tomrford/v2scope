<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { connectedDevices } from "$lib/store/device-store";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const consensus = $derived($deviceConsensus);
  const sessions = $derived($connectedDevices);
  const permissions = $derived($runtimeCommandPermissions);

  const numChannels = $derived(consensus.staticInfo.value?.numChannels ?? 0);
  const variables = $derived.by(() => {
    if (consensus.variables.entries.length > 0) {
      return consensus.variables.entries;
    }

    if (sessions.length !== 1) return [];
    const entries = sessions[0].catalog.varList?.entries ?? [];
    return entries
      .map((name, idx) => (name ? { idx, name } : null))
      .filter(Boolean) as Array<{ idx: number; name: string }>;
  });
  const channelMap = $derived.by(() => {
    const aligned = consensus.channelMap.value?.varIds;
    if (aligned && aligned.length > 0) {
      return aligned;
    }
    if (sessions.length === 1) {
      return sessions[0].channelMap?.varIds ?? [];
    }
    return [];
  });

  const disabled = $derived(
    !permissions.setChannelMap || variables.length === 0,
  );

  const handleChannelChange = (channelIdx: number, catalogIdx: string) => {
    enqueueGuardedCommand({
      type: "setChannelMap",
      channelIdx,
      catalogIdx: parseInt(catalogIdx),
    });
  };
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" {...props}>Channels</Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64">
    <div class="flex flex-col gap-3">
      <h4 class="text-sm font-medium">Channel Map</h4>
      {#each Array.from({ length: numChannels }, (_, i) => i) as i (i)}
        <div class="flex items-center gap-2">
          <span class="w-10 shrink-0 text-xs text-muted-foreground">Ch {i + 1}</span>
          <Select.Root
            type="single"
            value={String(channelMap[i] ?? "")}
            onValueChange={(v) => {
              if (v) handleChannelChange(i, v);
            }}
            {disabled}
          >
            <Select.Trigger class="w-full text-xs">
              {variables.find((v) => v.idx === channelMap[i])?.name ?? "—"}
            </Select.Trigger>
            <Select.Content>
              {#each variables as variable (variable.idx)}
                <Select.Item value={String(variable.idx)}>{variable.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/each}
      {#if numChannels === 0}
        <p class="text-xs text-muted-foreground">No device connected</p>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
