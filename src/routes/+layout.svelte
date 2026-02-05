<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import {
    initSettings,
    pollingConfig,
    settingsRecoveryWarning,
  } from "$lib/settings";
  import { getActivePorts, initSavedPorts } from "$lib/ports";
  import { activatePorts, makeRuntime } from "$lib/runtime";
  import { startRuntimeStores } from "$lib/store/runtime";
  import AppShell from "$lib/components/app-shell.svelte";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    children?: import("svelte").Snippet;
  }

  type BootstrapPhase = "settings" | "saved_ports" | "runtime";
  type BootstrapFatal = {
    phase: BootstrapPhase;
    message: string;
  };

  type RuntimePollingConfig = {
    stateHz: number;
    frameHz: number;
    frameTimeoutMs: number;
    crcRetryAttempts: number;
  };

  let { children }: Props = $props();

  let ready = $state(false);
  let fatal = $state<BootstrapFatal | null>(null);
  let warnings = $state<string[]>([]);
  let currentConfig: RuntimePollingConfig | null = null;
  let retryBootstrap: (() => void) | null = null;

  const isSameConfig = (
    left: RuntimePollingConfig,
    right: RuntimePollingConfig,
  ): boolean =>
    left.stateHz === right.stateHz &&
    left.frameHz === right.frameHz &&
    left.frameTimeoutMs === right.frameTimeoutMs &&
    left.crcRetryAttempts === right.crcRetryAttempts;

  const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  };

  const setFatal = (phase: BootstrapPhase, error: unknown): void => {
    fatal = { phase, message: toErrorMessage(error) };
  };

  const restartRuntime = async (config: RuntimePollingConfig) => {
    const active = getActivePorts();
    await startRuntimeStores(makeRuntime(config));
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
    let attempt = 0;

    const boot = () => {
      const runId = ++attempt;
      ready = false;
      fatal = null;
      warnings = [];
      unsubscribe?.();
      unsubscribe = null;

      void (async () => {
        if (!isTauri()) {
          ready = true;
          return;
        }

        try {
          await initSettings();
        } catch (error) {
          if (!cancelled && runId === attempt) {
            setFatal("settings", error);
            ready = true;
          }
          return;
        }

        try {
          await initSavedPorts();
        } catch (error) {
          if (!cancelled && runId === attempt) {
            warnings = [
              ...warnings,
              `Saved ports unavailable: ${toErrorMessage(error)}`,
            ];
          }
        }
        if (!cancelled && runId === attempt) {
          try {
            const startupNotice = await invoke<string | null>(
              "take_startup_notice",
            );
            if (startupNotice) {
              warnings = [...warnings, startupNotice];
            }
          } catch {
            // Ignore startup notice retrieval failures; non-critical path.
          }
        }

        if (cancelled || runId !== attempt) return;
        const config = get(pollingConfig);

        try {
          await startRuntimeStores(makeRuntime(config));
        } catch (error) {
          if (!cancelled && runId === attempt) {
            setFatal("runtime", error);
            ready = true;
          }
          return;
        }

        currentConfig = config;

        unsubscribe = pollingConfig.subscribe((next) => {
          if (!currentConfig || isSameConfig(currentConfig, next)) return;
          currentConfig = next;
          void restartRuntime(next).catch((error) => {
            setFatal("runtime", error);
            ready = true;
          });
        });

        if (!cancelled && runId === attempt) {
          ready = true;
        }
      })();
    };

    retryBootstrap = boot;
    boot();

    return () => {
      cancelled = true;
      retryBootstrap = null;
      unsubscribe?.();
    };
  });
</script>

{#if ready && fatal}
  <div class="flex h-svh items-center justify-center p-6">
    <div
      class="flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6"
    >
      <h1 class="text-lg font-semibold text-destructive">
        Startup failed ({fatal.phase})
      </h1>
      <p class="text-sm text-destructive/90">{fatal.message}</p>
      <div>
        <Button size="sm" variant="outline" onclick={() => retryBootstrap?.()}
          >Retry</Button
        >
      </div>
    </div>
  </div>
{:else if ready}
  <AppShell>
    {#if $settingsRecoveryWarning || warnings.length > 0}
      <div class="flex flex-col gap-2">
        {#if $settingsRecoveryWarning}
          <div
            class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800"
          >
            {$settingsRecoveryWarning}
          </div>
        {/if}
        {#if warnings.length > 0}
          <div
            class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
          >
            {warnings.join(" ")}
          </div>
        {/if}
      </div>
    {/if}
    {@render children?.()}
  </AppShell>
{/if}
