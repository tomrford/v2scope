import {
  createTable,
  type RowData,
  type Table,
  type TableOptions,
  type TableOptionsResolved,
} from "@tanstack/table-core";

/**
 * Creates a reactive TanStack Table instance for Svelte 5.
 *
 * Uses Svelte 5's $state rune internally to make the table reactive.
 * The options should use getters for reactive data (e.g., `get data() { return data }`).
 */
export function createSvelteTable<TData extends RowData>(
  options: TableOptions<TData>,
): Table<TData> {
  const resolvedOptions: TableOptionsResolved<TData> = {
    state: {},
    onStateChange: () => {},
    renderFallbackValue: null,
    ...options,
  };

  const table = createTable(resolvedOptions);

  // Use Svelte 5 $state for reactivity
  let tableState = $state(table.initialState);

  // Override the state getter to return our reactive state
  table.setOptions((prev) => ({
    ...prev,
    ...options,
    state: {
      ...tableState,
      ...options.state,
    },
    onStateChange: (updater) => {
      if (typeof updater === "function") {
        tableState = updater(tableState);
      } else {
        tableState = updater;
      }
      options.onStateChange?.(updater);
    },
  }));

  return table;
}
