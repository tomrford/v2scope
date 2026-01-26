export { createSvelteTable } from "./create-table.svelte.js";
export {
  default as FlexRender,
  type FlexRenderContent,
} from "./flex-render.svelte";
export {
  renderComponent,
  renderSnippet,
  type RenderComponentConfig,
  type RenderSnippetConfig,
} from "./render-helpers.js";

// Re-export commonly used TanStack Table Core types and functions
export {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
  type Table,
  type VisibilityState,
} from "@tanstack/table-core";
