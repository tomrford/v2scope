<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Toggle } from "$lib/components/ui/toggle";
  import { settings, updateSetting } from "$lib/store/settings";
  import type { SerialConfig } from "$lib/transport/serial.schema";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CableIcon from "@lucide/svelte/icons/cable";
  import CameraIcon from "@lucide/svelte/icons/camera";

  type SettingsSection = "polling" | "serial" | "snapshots";

  let {
    open = $bindable(false),
    initialSection = null,
  }: { open?: boolean; initialSection?: SettingsSection | null } = $props();

  let activeSection = $state<SettingsSection>("polling");

  $effect(() => {
    if (open && initialSection) {
      activeSection = initialSection;
    }
  });

  const sections: {
    id: SettingsSection;
    label: string;
    icon: typeof ClockIcon;
  }[] = [
    { id: "polling", label: "Polling", icon: ClockIcon },
    { id: "serial", label: "Serial", icon: CableIcon },
    { id: "snapshots", label: "Snapshots", icon: CameraIcon },
  ];

  // Helper for gc days toggle + value
  let gcEnabled = $derived($settings.snapshotGcDays !== "never");
  let gcDaysValue = $derived(
    typeof $settings.snapshotGcDays === "number"
      ? $settings.snapshotGcDays
      : 30,
  );

  function setGcEnabled(enabled: boolean) {
    if (enabled) {
      updateSetting("snapshotGcDays", gcDaysValue);
    } else {
      updateSetting("snapshotGcDays", "never");
    }
  }

  function setGcDaysValue(value: number) {
    if ($settings.snapshotGcDays === "never") return;
    updateSetting("snapshotGcDays", Math.max(1, Math.min(365, value)));
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

  function updateSerialConfig<K extends keyof SerialConfig>(
    key: K,
    value: SerialConfig[K],
  ) {
    updateSetting("defaultSerialConfig", {
      ...$settings.defaultSerialConfig,
      [key]: value,
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex h-[420px] max-w-2xl gap-0 p-0">
    <!-- Sidebar -->
    <div
      class="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-3"
    >
      <div class="mb-2 px-2 text-xs font-medium text-muted-foreground">
        Settings
      </div>
      {#each sections as section (section.id)}
        {@const Icon = section.icon}
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors {activeSection ===
          section.id
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
          onclick={() => (activeSection = section.id)}
        >
          <Icon class="size-4" />
          {section.label}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <Dialog.Header class="shrink-0 border-b border-border px-6 py-4">
        <Dialog.Title>
          {sections.find((s) => s.id === activeSection)?.label} Settings
        </Dialog.Title>
      </Dialog.Header>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        {#if activeSection === "polling"}
          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >State polling (Hz)</span
              >
              <Input
                type="number"
                min={1}
                max={100}
                value={$settings.statePollingHz}
                oninput={(e) =>
                  updateSetting(
                    "statePollingHz",
                    parseInt(e.currentTarget.value) || 20,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >Frame polling (Hz)</span
              >
              <Input
                type="number"
                min={1}
                max={50}
                value={$settings.framePollingHz}
                oninput={(e) =>
                  updateSetting(
                    "framePollingHz",
                    parseInt(e.currentTarget.value) || 10,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >Frame timeout (ms)</span
              >
              <Input
                type="number"
                min={10}
                max={5000}
                value={$settings.frameTimeoutMs}
                oninput={(e) =>
                  updateSetting(
                    "frameTimeoutMs",
                    parseInt(e.currentTarget.value) || 100,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >CRC retry attempts</span
              >
              <Input
                type="number"
                min={1}
                max={10}
                value={$settings.crcRetryAttempts}
                oninput={(e) =>
                  updateSetting(
                    "crcRetryAttempts",
                    parseInt(e.currentTarget.value) || 3,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground">Live buffer (s)</span>
              <Input
                type="number"
                min={1}
                max={300}
                value={$settings.liveBufferDurationS}
                oninput={(e) =>
                  updateSetting(
                    "liveBufferDurationS",
                    parseInt(e.currentTarget.value) || 10,
                  )}
              />
            </div>
          </div>
        {:else if activeSection === "serial"}
          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground">Baud rate</span>
              <Input
                type="number"
                min={1}
                value={$settings.defaultSerialConfig.baudRate}
                oninput={(e) =>
                  updateSerialConfig(
                    "baudRate",
                    parseInt(e.currentTarget.value) || 115200,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground"
                >Read timeout (ms)</span
              >
              <Input
                type="number"
                min={0}
                value={$settings.defaultSerialConfig.readTimeoutMs}
                oninput={(e) =>
                  updateSerialConfig(
                    "readTimeoutMs",
                    parseInt(e.currentTarget.value) || 0,
                  )}
              />
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground">Data bits</span>
              <Select.Root
                type="single"
                value={$settings.defaultSerialConfig.dataBits}
                onValueChange={(v) => {
                  if (v)
                    updateSerialConfig(
                      "dataBits",
                      v as SerialConfig["dataBits"],
                    );
                }}
              >
                <Select.Trigger class="w-full">
                  {$settings.defaultSerialConfig.dataBits}
                </Select.Trigger>
                <Select.Content>
                  {#each dataBitsOptions as opt (opt)}
                    <Select.Item value={opt}>{opt}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground">Parity</span>
              <Select.Root
                type="single"
                value={$settings.defaultSerialConfig.parity}
                onValueChange={(v) => {
                  if (v)
                    updateSerialConfig("parity", v as SerialConfig["parity"]);
                }}
              >
                <Select.Trigger class="w-full">
                  {$settings.defaultSerialConfig.parity}
                </Select.Trigger>
                <Select.Content>
                  {#each parityOptions as opt (opt)}
                    <Select.Item value={opt}>{opt}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            <div class="grid grid-cols-[1fr_100px] items-center gap-4">
              <span class="text-sm text-muted-foreground">Stop bits</span>
              <Select.Root
                type="single"
                value={$settings.defaultSerialConfig.stopBits}
                onValueChange={(v) => {
                  if (v)
                    updateSerialConfig(
                      "stopBits",
                      v as SerialConfig["stopBits"],
                    );
                }}
              >
                <Select.Trigger class="w-full">
                  {$settings.defaultSerialConfig.stopBits}
                </Select.Trigger>
                <Select.Content>
                  {#each stopBitsOptions as opt (opt)}
                    <Select.Item value={opt}>{opt}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          </div>
        {:else if activeSection === "snapshots"}
          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_auto] items-center gap-4">
              <span class="text-sm text-muted-foreground">Auto-save</span>
              <Toggle
                variant="outline"
                size="sm"
                aria-label="Toggle auto-save snapshots"
                pressed={$settings.snapshotAutoSave}
                onPressedChange={(p) => updateSetting("snapshotAutoSave", p)}
              >
                {$settings.snapshotAutoSave ? "On" : "Off"}
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
        {/if}
      </div>

      <Dialog.Footer class="shrink-0 border-t border-border px-6 py-3">
        <Button onclick={() => (open = false)}>Close</Button>
      </Dialog.Footer>
    </div>
  </Dialog.Content>
</Dialog.Root>
