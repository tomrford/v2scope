<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";

  type Props = {
    hasOverride: boolean;
  };

  let { hasOverride }: Props = $props();
</script>

<Badge variant={hasOverride ? "outline" : "secondary"}>
  {hasOverride ? "Custom" : "Default"}
</Badge>
