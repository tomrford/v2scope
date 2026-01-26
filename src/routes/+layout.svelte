<script lang="ts">
	import './layout.css';
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import { isTauri } from "@tauri-apps/api/core";
	import { initSettings, pollingConfig } from "$lib/settings";
	import { initSavedPorts } from "$lib/ports";
	import { startRuntimeStores } from "$lib/store/runtime";
	import AppShell from "$lib/components/app-shell.svelte";
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	let ready = $state(false);

	onMount(async () => {
		if (isTauri()) {
			await initSettings();
			await initSavedPorts();
			// Start runtime after settings are loaded
			const config = get(pollingConfig);
			await startRuntimeStores(config);
		}
		ready = true;
	});
</script>

{#if ready}
	<AppShell>
		{@render children?.()}
	</AppShell>
{/if}
