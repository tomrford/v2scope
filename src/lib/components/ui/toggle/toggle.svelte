<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";

  export const toggleVariants = tv({
    base: "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
  export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
</script>

<script lang="ts">
  import { Toggle as TogglePrimitive } from "bits-ui";
  import {
    cn,
    type WithElementRef,
    type WithoutChildrenOrChild,
  } from "$lib/utils.js";
  import type { Snippet } from "svelte";

  type ToggleProps = WithoutChildrenOrChild<
    WithElementRef<TogglePrimitive.RootProps>
  > & {
    variant?: ToggleVariant;
    size?: ToggleSize;
    children?: Snippet;
  };

  let {
    class: className,
    variant = "default",
    size = "default",
    ref = $bindable(null),
    pressed = $bindable(false),
    children: childrenProp,
    ...restProps
  }: ToggleProps = $props();
</script>

<TogglePrimitive.Root
  bind:ref
  bind:pressed
  data-slot="toggle"
  class={cn(toggleVariants({ variant, size }), className)}
  {...restProps}
>
	<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
	{#snippet children(_props)}
		{@render childrenProp?.()}
	{/snippet}
</TogglePrimitive.Root>
