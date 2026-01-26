<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Toggle } from "$lib/components/ui/toggle";
  import { settings, updateSetting } from "$lib/store/settings";
  import type { Settings } from "$lib/settings/schema";
  import type { SerialConfig } from "$lib/transport/serial.schema";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  // Local form state - initialized from store when dialog opens
  let formState = $state<Settings | null>(null);

  // Initialize form when dialog opens
  $effect(() => {
    if (open && !formState) {
      formState = structuredClone($settings);
    } else if (!open) {
      formState = null;
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
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description
        >Configure application settings. Changes are saved when you click Save.</Dialog.Description
      >
    </Dialog.Header>

    {#if formState}
      <div class="grid gap-6 py-4">
        <!-- Polling Settings -->
        <section>
          <h3 class="mb-4 text-sm font-medium text-foreground">Polling</h3>
          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label for="statePollingHz" class="text-sm text-muted-foreground">
                State polling rate (Hz)
              </label>
              <Input
                id="statePollingHz"
                type="number"
                min={1}
                max={100}
                bind:value={formState.statePollingHz}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label for="framePollingHz" class="text-sm text-muted-foreground">
                Frame polling rate (Hz)
              </label>
              <Input
                id="framePollingHz"
                type="number"
                min={1}
                max={50}
                bind:value={formState.framePollingHz}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label for="frameTimeoutMs" class="text-sm text-muted-foreground">
                Frame timeout (ms)
              </label>
              <Input
                id="frameTimeoutMs"
                type="number"
                min={10}
                max={5000}
                bind:value={formState.frameTimeoutMs}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label
                for="crcRetryAttempts"
                class="text-sm text-muted-foreground"
              >
                CRC retry attempts
              </label>
              <Input
                id="crcRetryAttempts"
                type="number"
                min={1}
                max={10}
                bind:value={formState.crcRetryAttempts}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label
                for="liveBufferDurationS"
                class="text-sm text-muted-foreground"
              >
                Live buffer duration (s)
              </label>
              <Input
                id="liveBufferDurationS"
                type="number"
                min={1}
                max={300}
                bind:value={formState.liveBufferDurationS}
              />
            </div>
          </div>
        </section>

        <!-- Serial Settings -->
        <section>
          <h3 class="mb-4 text-sm font-medium text-foreground">
            Default Serial Configuration
          </h3>
          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label for="baudRate" class="text-sm text-muted-foreground"
                >Baud rate</label
              >
              <Input
                id="baudRate"
                type="number"
                min={1}
                bind:value={formState.defaultSerialConfig.baudRate}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <label for="readTimeoutMs" class="text-sm text-muted-foreground">
                Read timeout (ms)
              </label>
              <Input
                id="readTimeoutMs"
                type="number"
                min={0}
                bind:value={formState.defaultSerialConfig.readTimeoutMs}
              />
            </div>

            <!-- Data Bits -->
            <div class="grid grid-cols-[1fr_auto] items-start gap-4">
              <span class="pt-1 text-sm text-muted-foreground">Data bits</span>
              <RadioGroup.Root
                value={formState.defaultSerialConfig.dataBits}
                onValueChange={(v) => {
                  if (formState)
                    formState.defaultSerialConfig.dataBits =
                      v as SerialConfig["dataBits"];
                }}
                class="flex gap-4"
              >
                {#each ["Five", "Six", "Seven", "Eight"] as bits}
                  <div class="flex items-center gap-2">
                    <RadioGroup.Item value={bits} id={`dataBits-${bits}`} />
                    <label for={`dataBits-${bits}`} class="text-sm"
                      >{bits}</label
                    >
                  </div>
                {/each}
              </RadioGroup.Root>
            </div>

            <!-- Parity -->
            <div class="grid grid-cols-[1fr_auto] items-start gap-4">
              <span class="pt-1 text-sm text-muted-foreground">Parity</span>
              <RadioGroup.Root
                value={formState.defaultSerialConfig.parity}
                onValueChange={(v) => {
                  if (formState)
                    formState.defaultSerialConfig.parity =
                      v as SerialConfig["parity"];
                }}
                class="flex gap-4"
              >
                {#each ["None", "Odd", "Even"] as parity}
                  <div class="flex items-center gap-2">
                    <RadioGroup.Item value={parity} id={`parity-${parity}`} />
                    <label for={`parity-${parity}`} class="text-sm"
                      >{parity}</label
                    >
                  </div>
                {/each}
              </RadioGroup.Root>
            </div>

            <!-- Stop Bits -->
            <div class="grid grid-cols-[1fr_auto] items-start gap-4">
              <span class="pt-1 text-sm text-muted-foreground">Stop bits</span>
              <RadioGroup.Root
                value={formState.defaultSerialConfig.stopBits}
                onValueChange={(v) => {
                  if (formState)
                    formState.defaultSerialConfig.stopBits =
                      v as SerialConfig["stopBits"];
                }}
                class="flex gap-4"
              >
                {#each ["One", "Two"] as stopBits}
                  <div class="flex items-center gap-2">
                    <RadioGroup.Item
                      value={stopBits}
                      id={`stopBits-${stopBits}`}
                    />
                    <label for={`stopBits-${stopBits}`} class="text-sm"
                      >{stopBits}</label
                    >
                  </div>
                {/each}
              </RadioGroup.Root>
            </div>
          </div>
        </section>

        <!-- Snapshot Settings -->
        <section>
          <h3 class="mb-4 text-sm font-medium text-foreground">Snapshots</h3>
          <div class="grid gap-4">
            <!-- Auto Save -->
            <div class="grid grid-cols-[1fr_auto] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >Auto-save snapshots</span
              >
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

            <!-- Garbage Collection -->
            <div class="grid grid-cols-[1fr_auto] items-center gap-4">
              <span class="text-sm text-muted-foreground">Snapshot cleanup</span
              >
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
                  class="w-20"
                />
                <span class="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel}>Cancel</Button>
      <Button onclick={handleSave}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
