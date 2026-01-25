<script lang="ts">
	import './layout.css';
	import { onMount } from "svelte";
	import { initSettings } from "$lib/settings";

	let ready = false;

	onMount(async () => {
		await initSettings();
		ready = true;
	});
</script>

{#if ready}
	<slot></slot>
{/if}
