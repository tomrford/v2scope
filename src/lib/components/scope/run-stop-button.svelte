<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { State } from "$lib/protocol/types";
  import { consensusState } from "$lib/store/device-consensus";
  import {
    runtimeCanRequestRun,
    runtimeCanRequestStop,
  } from "$lib/store/runtime-policy.svelte";
  import { enqueueGuardedCommand } from "$lib/runtime/command-policy";

  const canRun = $derived($runtimeCanRequestRun);
  const canStop = $derived($runtimeCanRequestStop);

  const currentState = $derived($consensusState.value?.state ?? null);
  const isHalted = $derived(currentState === State.HALTED);

  const indicatorColor = $derived.by(() => {
    switch (currentState) {
      case State.HALTED:
        return "bg-blue-500";
      case State.RUNNING:
        return "bg-orange-500";
      case State.ACQUIRING:
        return "bg-green-500";
      case State.MISCONFIGURED:
        return "bg-red-500";
      default:
        return "bg-red-500";
    }
  });

  const handleClick = () => {
    if (isHalted) {
      enqueueGuardedCommand({ type: "setState", state: State.RUNNING });
    } else {
      enqueueGuardedCommand({ type: "setState", state: State.HALTED });
    }
  };
</script>

<div class="flex flex-col items-center gap-1">
  <Button
    variant="outline"
    disabled={isHalted ? !canRun : !canStop}
    onclick={handleClick}
  >
    {isHalted ? "Run" : "Stop"}
  </Button>
  <div class="h-1 w-full rounded-full {indicatorColor}"></div>
</div>
