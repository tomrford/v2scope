<script lang="ts">
	import './layout.css';
	import { onMount } from "svelte";
	import { isTauri } from "@tauri-apps/api/core";
	import { initSettings } from "$lib/settings";
	import AppShell from "$lib/components/app-shell.svelte";

	let ready = false;

	onMount(async () => {
		if (isTauri()) {
			await initSettings();
		}
		ready = true;
	});
</script>

{#if ready}
	<AppShell>
		<slot></slot>
	</AppShell>
{/if}
