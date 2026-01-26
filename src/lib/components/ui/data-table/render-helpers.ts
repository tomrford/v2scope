import type { Component, Snippet } from "svelte";

/**
 * Helper type for rendering components in data table cells.
 * Used with FlexRender to render Svelte components dynamically.
 */
export type RenderComponentConfig<TProps extends Record<string, unknown>> = {
  component: Component<TProps>;
  props: TProps;
};

/**
 * Create a renderable component configuration.
 * Use this when defining column cells that need to render Svelte components.
 */
export function renderComponent<TProps extends Record<string, unknown>>(
  component: Component<TProps>,
  props: TProps,
): RenderComponentConfig<TProps> {
  return { component, props };
}

/**
 * Helper type for rendering snippets in data table cells.
 */
export type RenderSnippetConfig<TProps> = {
  snippet: Snippet<[TProps]>;
  props: TProps;
};

/**
 * Create a renderable snippet configuration.
 * Use this when defining column cells that need to render Svelte snippets.
 */
export function renderSnippet<TProps>(
  snippet: Snippet<[TProps]>,
  props: TProps,
): RenderSnippetConfig<TProps> {
  return { snippet, props };
}
