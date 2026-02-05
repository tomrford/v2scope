<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { TriggerMode } from "$lib/protocol/types";
  import { deviceConsensus } from "$lib/store/device-consensus";
  import { runtimeCommandPermissions } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const consensus = $derived($deviceConsensus);
  const permissions = $derived($runtimeCommandPermissions);

  const trigger = $derived(consensus.trigger.value);
  const numChannels = $derived(consensus.staticInfo.value?.numChannels ?? 0);
  const variables = $derived(consensus.variables.entries);
  const channelMap = $derived(consensus.channelMap.value?.varIds ?? []);

  const modeOptions: Array<{ value: TriggerMode; label: string }> = [
    { value: TriggerMode.DISABLED, label: "Disabled" },
    { value: TriggerMode.RISING, label: "Rising" },
    { value: TriggerMode.FALLING, label: "Falling" },
    { value: TriggerMode.BOTH, label: "Both" },
  ];

  const channelLabel = (i: number): string => {
    const varId = channelMap[i];
    const varName = variables.find((v) => v.idx === varId)?.name;
    return varName ? `Ch ${i + 1} (${varName})` : `Ch ${i + 1}`;
  };

  let open = $state(false);
  let localMode = $state<TriggerMode>(TriggerMode.DISABLED);
  let localChannel = $state(0);
  let localThreshold = $state(0);

  const disabled = $derived(!permissions.setTrigger);

  $effect(() => {
    if (open && trigger) {
      localMode = trigger.mode;
      localChannel = trigger.channel;
      localThreshold = trigger.threshold;
    }
  });

  const handleUpdate = () => {
    enqueueGuardedCommand({
      type: "setTrigger",
      threshold: localThreshold,
      channel: localChannel,
      mode: localMode,
    });
    open = false;
  };
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" {...props}>Trigger</Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-72">
    <div class="flex flex-col gap-3">
      <h4 class="text-sm font-medium">Trigger</h4>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Mode</span>
        <Select.Root
          type="single"
          value={String(localMode)}
          onValueChange={(v) => {
            if (v) localMode = parseInt(v) as TriggerMode;
          }}
          {disabled}
        >
          <Select.Trigger class="w-full">
            {modeOptions.find((m) => m.value === localMode)?.label ?? "—"}
          </Select.Trigger>
          <Select.Content>
            {#each modeOptions as opt (opt.value)}
              <Select.Item value={String(opt.value)}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Channel</span>
        <Select.Root
          type="single"
          value={String(localChannel)}
          onValueChange={(v) => {
            if (v) localChannel = parseInt(v);
          }}
          {disabled}
        >
          <Select.Trigger class="w-full">
            {channelLabel(localChannel)}
          </Select.Trigger>
          <Select.Content>
            {#each Array.from({ length: numChannels }, (_, i) => i) as i (i)}
              <Select.Item value={String(i)}>{channelLabel(i)}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-muted-foreground" for="trigger-threshold">Threshold</label>
        <Input
          id="trigger-threshold"
          type="number"
          step="any"
          bind:value={localThreshold}
          {disabled}
        />
      </div>

      <Button size="sm" {disabled} onclick={handleUpdate}>Update</Button>
    </div>
  </Popover.Content>
</Popover.Root>
