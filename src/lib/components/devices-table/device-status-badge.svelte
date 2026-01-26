<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { DeviceStatus } from "./types.js";

  type Props = {
    status: DeviceStatus;
    errorMessage?: string | null;
  };

  let { status, errorMessage }: Props = $props();

  const statusConfig: Record<
    DeviceStatus,
    { label: string; variant: "default" | "destructive" | "secondary" | "outline" }
  > = {
    connected: { label: "Connected", variant: "default" },
    error: { label: "Error", variant: "destructive" },
    deactivated: { label: "Inactive", variant: "secondary" },
    unknown: { label: "Unknown", variant: "outline" },
  };

  const config = $derived(statusConfig[status]);
</script>

<span title={status === "error" && errorMessage ? errorMessage : undefined}>
  <Badge variant={config.variant}>
    <span class="flex items-center gap-1.5">
      <span
        class="h-2 w-2 rounded-full"
        class:bg-green-500={status === "connected"}
        class:bg-red-500={status === "error"}
        class:bg-gray-400={status === "deactivated"}
        class:bg-yellow-500={status === "unknown"}
      ></span>
      {config.label}
    </span>
  </Badge>
</span>
