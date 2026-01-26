<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";

  type Props = {
    persisted: boolean;
  };

  let { persisted }: Props = $props();
</script>

<Badge variant={persisted ? "default" : "secondary"}>
  {persisted ? "Saved" : "Session"}
</Badge>
