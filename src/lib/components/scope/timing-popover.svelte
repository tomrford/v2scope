<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const consensus = $derived($deviceConsensus);
  const permissions = $derived($runtimeCommandPermissions);

  const staticInfo = $derived(consensus.staticInfo.value);
  const timing = $derived(consensus.timing.value);

  const storeDurationS = $derived(
    timing && staticInfo
      ? (timing.divider * staticInfo.bufferSize) / (staticInfo.isrKhz * 1000)
      : 0,
  );
  const storePreTrigS = $derived(
    timing && staticInfo
      ? (timing.preTrig * timing.divider) / (staticInfo.isrKhz * 1000)
      : 0,
  );

  let open = $state(false);
  let localDuration = $state(0);
  let localPreTrig = $state(0);

  const valid = $derived(localDuration > 0 && localPreTrig >= 0 && localPreTrig <= localDuration);
  const disabled = $derived(!permissions.setTiming);

  $effect(() => {
    if (open) {
      localDuration = storeDurationS;
      localPreTrig = storePreTrigS;
    }
  });

  const handleUpdate = () => {
    if (!staticInfo || !valid) return;
    const divider = Math.max(1, Math.round((localDuration * staticInfo.isrKhz * 1000) / staticInfo.bufferSize));
    const preTrig = Math.max(0, Math.round((localPreTrig * staticInfo.isrKhz * 1000) / divider));
    enqueueGuardedCommand({ type: "setTiming", divider, preTrig });
    open = false;
  };
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" {...props}>Timing</Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64">
    <div class="flex flex-col gap-3">
      <h4 class="text-sm font-medium">Timing</h4>
      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-muted-foreground" for="timing-duration">Duration (s)</label>
        <Input
          id="timing-duration"
          type="number"
          step="any"
          min="0"
          bind:value={localDuration}
          {disabled}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-muted-foreground" for="timing-pretrig">Pre-trigger (s)</label>
        <Input
          id="timing-pretrig"
          type="number"
          step="any"
          min="0"
          bind:value={localPreTrig}
          {disabled}
        />
      </div>
      {#if !valid && localDuration > 0}
        <p class="text-xs text-destructive">Pre-trigger must be &le; duration</p>
      {/if}
      <Button size="sm" disabled={disabled || !valid} onclick={handleUpdate}>Update</Button>
    </div>
  </Popover.Content>
</Popover.Root>
