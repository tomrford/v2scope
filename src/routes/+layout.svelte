<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { isTauri } from "@tauri-apps/api/core";
  import { initSettings, pollingConfig } from "$lib/settings";
  import { getActivePorts, initSavedPorts } from "$lib/ports";
  import { activatePorts, makeRuntime } from "$lib/runtime";
  import { startRuntimeStores } from "$lib/store/runtime";
  import AppShell from "$lib/components/app-shell.svelte";
  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();

  let ready = $state(false);
  type RuntimePollingConfig = {
    stateHz: number;
    frameHz: number;
    frameTimeoutMs: number;
    crcRetryAttempts: number;
  };

  let currentConfig: RuntimePollingConfig | null = null;

  const isSameConfig = (
    left: RuntimePollingConfig,
    right: RuntimePollingConfig,
  ): boolean =>
    left.stateHz === right.stateHz &&
    left.frameHz === right.frameHz &&
    left.frameTimeoutMs === right.frameTimeoutMs &&
    left.crcRetryAttempts === right.crcRetryAttempts;

  const restartRuntime = async (config: RuntimePollingConfig) => {
    await startRuntimeStores(makeRuntime(config));
    const active = getActivePorts();
    if (active.length === 0) return;
    try {
      await activatePorts(active);
    } catch (error) {
      console.info("reconnect failed", error);
    }
  };

  onMount(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      if (isTauri()) {
        await initSettings();
        await initSavedPorts();
        if (cancelled) return;
        // Start runtime after settings are loaded
        const config = get(pollingConfig);
        await startRuntimeStores(makeRuntime(config));
        currentConfig = config;

        unsubscribe = pollingConfig.subscribe((next) => {
          if (!currentConfig || isSameConfig(currentConfig, next)) return;
          currentConfig = next;
          void restartRuntime(next);
        });
      }
      ready = true;
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  });
</script>

{#if ready}
  <AppShell>
    {@render children?.()}
  </AppShell>
{/if}
