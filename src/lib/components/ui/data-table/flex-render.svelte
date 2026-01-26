<script lang="ts" module>
  import type { Component, Snippet } from "svelte";
  import type { RenderComponentConfig, RenderSnippetConfig } from "./render-helpers.js";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type FlexRenderContent<TProps extends Record<string, unknown> = any> =
    | string
    | number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | Component<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | RenderComponentConfig<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | RenderSnippetConfig<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((props: TProps) => any)
    | null
    | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isRenderComponentConfig(content: any): content is RenderComponentConfig<any> {
    return (
      typeof content === "object" &&
      content !== null &&
      "component" in content &&
      "props" in content
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isRenderSnippetConfig(content: any): content is RenderSnippetConfig<any> {
    return (
      typeof content === "object" &&
      content !== null &&
      "snippet" in content &&
      "props" in content
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isComponent(content: any): content is Component<any> {
    // Svelte components are functions with specific properties
    // TanStack column def callbacks are also functions, so we need to distinguish
    // Components have a $$render or similar property, but this is internal
    // For simplicity, we check if it's a function and NOT a plain callback
    // by checking if it's a class or has component-like properties
    return (
      typeof content === "function" &&
      content.length === 0 &&
      content.prototype === undefined
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isCallback(content: any): content is (props: any) => any {
    return typeof content === "function";
  }
</script>

<script lang="ts">
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Props = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: FlexRenderContent<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props?: any;
  };

  let { content, props = {} }: Props = $props();

  // Compute the rendered value if content is a callback
  const renderedValue = $derived.by(() => {
    if (isCallback(content) && !isRenderComponentConfig(content) && !isRenderSnippetConfig(content)) {
      const result = content(props);
      return result;
    }
    return null;
  });
</script>

{#if content === null || content === undefined}
  <!-- empty -->
{:else if typeof content === "string" || typeof content === "number"}
  {content}
{:else if isRenderSnippetConfig(content)}
  {@render content.snippet(content.props)}
{:else if isRenderComponentConfig(content)}
  <content.component {...content.props} />
{:else if isCallback(content)}
  {#if renderedValue !== null && renderedValue !== undefined}
    {#if typeof renderedValue === "string" || typeof renderedValue === "number"}
      {renderedValue}
    {:else if isRenderComponentConfig(renderedValue)}
      <renderedValue.component {...renderedValue.props} />
    {:else if isRenderSnippetConfig(renderedValue)}
      {@render renderedValue.snippet(renderedValue.props)}
    {:else}
      {renderedValue}
    {/if}
  {/if}
{/if}
