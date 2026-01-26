<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";

  type Props = {
    hasOverride: boolean;
    summary?: string;
  };

  let { hasOverride, summary }: Props = $props();
</script>

<Badge variant={hasOverride ? "outline" : "secondary"} title={summary}>
  {hasOverride ? "Custom" : "Default"}
</Badge>
