<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Accordion from "$lib/components/ui/accordion";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Toggle } from "$lib/components/ui/toggle";
  import { settings, updateSetting } from "$lib/store/settings";
  import type { Settings } from "$lib/settings/schema";
  import type { SerialConfig } from "$lib/transport/serial.schema";

  type SettingsSection = "serial" | null;

  let {
    open = $bindable(false),
    initialSection = null,
  }: { open?: boolean; initialSection?: SettingsSection } = $props();

  // Local form state - initialized from store when dialog opens
  let formState = $state<Settings | null>(null);

  // Accordion value - controls which section is open
  let accordionValue = $state<string>("polling");

  // Initialize form when dialog opens
  $effect(() => {
    if (open && !formState) {
      formState = structuredClone($settings);
    } else if (!open) {
      formState = null;
    }
  });

  // Set accordion to correct section when opening
  $effect(() => {
    if (open) {
      accordionValue = initialSection ?? "polling";
    }
  });

  async function handleSave() {
    if (!formState) return;

    // Update all settings
    await updateSetting("statePollingHz", formState.statePollingHz);
    await updateSetting("framePollingHz", formState.framePollingHz);
    await updateSetting("frameTimeoutMs", formState.frameTimeoutMs);
    await updateSetting("crcRetryAttempts", formState.crcRetryAttempts);
    await updateSetting("liveBufferDurationS", formState.liveBufferDurationS);
    await updateSetting("defaultSerialConfig", formState.defaultSerialConfig);
    await updateSetting("snapshotAutoSave", formState.snapshotAutoSave);
    await updateSetting("snapshotGcDays", formState.snapshotGcDays);

    open = false;
  }

  function handleCancel() {
    formState = null;
    open = false;
  }

  // Helper for gc days toggle + value
  let gcEnabled = $derived(formState?.snapshotGcDays !== "never");
  let gcDaysValue = $derived(
    typeof formState?.snapshotGcDays === "number"
      ? formState.snapshotGcDays
      : 30,
  );

  function setGcEnabled(enabled: boolean) {
    if (!formState) return;
    if (enabled) {
      formState.snapshotGcDays = gcDaysValue;
    } else {
      formState.snapshotGcDays = "never";
    }
  }

  function setGcDaysValue(value: number) {
    if (!formState || formState.snapshotGcDays === "never") return;
    formState.snapshotGcDays = Math.max(1, Math.min(365, value));
  }

  // Options for dropdowns
  const dataBitsOptions: SerialConfig["dataBits"][] = [
    "Five",
    "Six",
    "Seven",
    "Eight",
  ];
  const parityOptions: SerialConfig["parity"][] = ["None", "Odd", "Even"];
  const stopBitsOptions: SerialConfig["stopBits"][] = ["One", "Two"];
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
    </Dialog.Header>

    {#if formState}
      <Accordion.Root bind:value={accordionValue} type="single" class="w-full">
        <!-- Polling Settings -->
        <Accordion.Item value="polling">
          <Accordion.Trigger>Polling</Accordion.Trigger>
          <Accordion.Content>
            <div class="grid gap-3">
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">State polling (Hz)</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  bind:value={formState.statePollingHz}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Frame polling (Hz)</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  bind:value={formState.framePollingHz}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Frame timeout (ms)</span>
                <Input
                  type="number"
                  min={10}
                  max={5000}
                  bind:value={formState.frameTimeoutMs}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">CRC retry attempts</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  bind:value={formState.crcRetryAttempts}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Live buffer (s)</span>
                <Input
                  type="number"
                  min={1}
                  max={300}
                  bind:value={formState.liveBufferDurationS}
                />
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>

        <!-- Serial Settings -->
        <Accordion.Item value="serial">
          <Accordion.Trigger>Serial</Accordion.Trigger>
          <Accordion.Content>
            <div class="grid gap-3">
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Baud rate</span>
                <Input
                  type="number"
                  min={1}
                  bind:value={formState.defaultSerialConfig.baudRate}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Read timeout (ms)</span>
                <Input
                  type="number"
                  min={0}
                  bind:value={formState.defaultSerialConfig.readTimeoutMs}
                />
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Data bits</span>
                <Select.Root
                  type="single"
                  value={formState.defaultSerialConfig.dataBits}
                  onValueChange={(v) => {
                    if (formState && v)
                      formState.defaultSerialConfig.dataBits =
                        v as SerialConfig["dataBits"];
                  }}
                >
                  <Select.Trigger class="w-full">
                    {formState.defaultSerialConfig.dataBits}
                  </Select.Trigger>
                  <Select.Content>
                    {#each dataBitsOptions as opt}
                      <Select.Item value={opt}>{opt}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Parity</span>
                <Select.Root
                  type="single"
                  value={formState.defaultSerialConfig.parity}
                  onValueChange={(v) => {
                    if (formState && v)
                      formState.defaultSerialConfig.parity =
                        v as SerialConfig["parity"];
                  }}
                >
                  <Select.Trigger class="w-full">
                    {formState.defaultSerialConfig.parity}
                  </Select.Trigger>
                  <Select.Content>
                    {#each parityOptions as opt}
                      <Select.Item value={opt}>{opt}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="grid grid-cols-[1fr_100px] items-center gap-4">
                <span class="text-sm text-muted-foreground">Stop bits</span>
                <Select.Root
                  type="single"
                  value={formState.defaultSerialConfig.stopBits}
                  onValueChange={(v) => {
                    if (formState && v)
                      formState.defaultSerialConfig.stopBits =
                        v as SerialConfig["stopBits"];
                  }}
                >
                  <Select.Trigger class="w-full">
                    {formState.defaultSerialConfig.stopBits}
                  </Select.Trigger>
                  <Select.Content>
                    {#each stopBitsOptions as opt}
                      <Select.Item value={opt}>{opt}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>

        <!-- Snapshot Settings -->
        <Accordion.Item value="snapshots">
          <Accordion.Trigger>Snapshots</Accordion.Trigger>
          <Accordion.Content>
            <div class="grid gap-3">
              <div class="grid grid-cols-[1fr_auto] items-center gap-4">
                <span class="text-sm text-muted-foreground">Auto-save</span>
                <Toggle
                  variant="outline"
                  size="sm"
                  aria-label="Toggle auto-save snapshots"
                  pressed={formState.snapshotAutoSave}
                  onPressedChange={(p) => {
                    if (formState) formState.snapshotAutoSave = p;
                  }}
                >
                  {formState.snapshotAutoSave ? "On" : "Off"}
                </Toggle>
              </div>
              <div class="grid grid-cols-[1fr_auto] items-center gap-4">
                <span class="text-sm text-muted-foreground">Cleanup</span>
                <div class="flex items-center gap-2">
                  <Toggle
                    variant="outline"
                    size="sm"
                    aria-label="Toggle snapshot cleanup"
                    pressed={gcEnabled}
                    onPressedChange={setGcEnabled}
                  >
                    {gcEnabled ? "On" : "Off"}
                  </Toggle>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={gcDaysValue}
                    disabled={!gcEnabled}
                    oninput={(e) =>
                      setGcDaysValue(parseInt(e.currentTarget.value) || 30)}
                    class="w-16"
                  />
                  <span class="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel}>Cancel</Button>
      <Button onclick={handleSave}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
