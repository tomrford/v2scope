<script lang="ts">
	import './layout.css';
	import { onMount } from "svelte";
	import { isTauri } from "@tauri-apps/api/core";
	import { initSettings } from "$lib/settings";
	import { initSavedPorts } from "$lib/ports";
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
		}
		ready = true;
	});
</script>

{#if ready}
	<AppShell>
		{@render children?.()}
	</AppShell>
{/if}
