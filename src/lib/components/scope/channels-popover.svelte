<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const consensus = $derived($deviceConsensus);
  const permissions = $derived($runtimeCommandPermissions);

  const numChannels = $derived(consensus.staticInfo.value?.numChannels ?? 0);
  const variables = $derived(consensus.variables.entries);
  const channelMap = $derived(consensus.channelMap.value?.varIds ?? []);

  const disabled = $derived(
    !permissions.setChannelMap || !consensus.variables.ready || !consensus.completeness.channelMap,
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
