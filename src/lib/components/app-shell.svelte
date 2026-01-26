<script lang="ts">
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="flex h-svh flex-col overflow-hidden">
  <Sidebar.Provider
    class="min-h-0 flex-1 overflow-hidden"
    disableKeyboardShortcut
  >
    <AppSidebar />
    <Sidebar.Inset class="overflow-hidden">
      <div class="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4">
        {@render children?.()}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>
