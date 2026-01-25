<script lang="ts">
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex min-h-svh flex-col">
	<Sidebar.Provider class="min-h-0 flex-1" disableKeyboardShortcut>
		<AppSidebar />
		<Sidebar.Inset>
			<div class="flex flex-1 flex-col gap-4 p-4">
				{@render children?.()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
</div>
