<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import NavMain from "./nav-main.svelte";
  import NavProjects from "./nav-projects.svelte";
  import NavSecondary from "./nav-secondary.svelte";
  import SettingsModal from "./settings-modal.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AudioWaveformIcon from "@lucide/svelte/icons/audio-waveform";
  import CameraIcon from "@lucide/svelte/icons/camera";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";
  import UsbIcon from "@lucide/svelte/icons/usb";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    ...restProps
  }: ComponentProps<typeof Sidebar.Root> = $props();

  let settingsOpen = $state(false);

  const navMain = $derived([
    {
      title: "Scope",
      url: "/scope",
      icon: AudioWaveformIcon,
      isActive:
        page.url.pathname.startsWith("/scope") || page.url.pathname === "/",
    },
    {
      title: "Devices",
      url: "/devices",
      icon: UsbIcon,
      isActive: page.url.pathname.startsWith("/devices"),
    },
    {
      title: "Snapshots",
      url: "/snapshots",
      icon: CameraIcon,
      isActive: page.url.pathname.startsWith("/snapshots"),
    },
  ]);

  const navSecondary = [
    {
      title: "Settings",
      onclick: () => (settingsOpen = true),
      icon: Settings2Icon,
    },
  ];

  const plots: { name: string; url: string; icon: typeof AudioWaveformIcon }[] =
    [];
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
  <Sidebar.Header class="pt-4">
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg">
          {#snippet child({ props })}
            <a href={resolve("/")} {...props}>
              <div
                class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
              >
                <AudioWaveformIcon class="size-4" />
              </div>
              <div class="grid flex-1 text-start text-sm leading-tight">
                <span class="truncate font-medium">VScope</span>
              </div>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <NavMain items={navMain} />
    <NavProjects {plots} />
    <NavSecondary items={navSecondary} class="mt-auto" />
  </Sidebar.Content>
</Sidebar.Root>

<SettingsModal bind:open={settingsOpen} />
