<script lang="ts">
  import { resolve } from "$app/paths";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { Component, ComponentProps } from "svelte";

  type NavItem = {
    title: string;
    icon: Component;
  } & ({ url: string; onclick?: never } | { onclick: () => void; url?: never });

  let {
    ref = $bindable(null),
    items,
    ...restProps
  }: {
    items: NavItem[];
  } & ComponentProps<typeof Sidebar.Group> = $props();
</script>

<Sidebar.Group bind:ref {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      {#each items as item (item.title)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton size="sm">
            {#snippet child({ props })}
              {#if item.onclick}
                <button
                  type="button"
                  onclick={item.onclick}
                  {...props}
                  class="{props.class} w-full text-left"
                >
                  <item.icon />
                  <span>{item.title}</span>
                </button>
              {:else}
                <a
                  href={resolve(item.url as Parameters<typeof resolve>[0])}
                  {...props}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              {/if}
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
