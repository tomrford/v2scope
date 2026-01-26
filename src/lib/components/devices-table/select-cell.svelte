<script lang="ts">
  import Check from "@lucide/svelte/icons/check";

  type Props = {
    selected: boolean;
    disabled: boolean;
    onclick: () => void;
  };

  let { selected, disabled, onclick }: Props = $props();
</script>

<button
  type="button"
  {onclick}
  {disabled}
  class="flex h-5 w-5 items-center justify-center rounded border {disabled
    ? 'cursor-not-allowed opacity-50'
    : 'cursor-pointer'} {selected ? 'border-primary bg-primary' : 'border-input'}"
>
  {#if selected}
    <Check class="h-3 w-3 text-primary-foreground" />
  {/if}
</button>
