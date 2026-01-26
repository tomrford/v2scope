<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    createSvelteTable,
    FlexRender,
    getCoreRowModel,
    renderComponent,
    type ColumnDef,
  } from "$lib/components/ui/data-table/index.js";
  import type { AvailablePortRow } from "./types.js";
  import SelectCell from "./select-cell.svelte";

  type Props = {
    ports: AvailablePortRow[];
    selectedPaths: string[];
    onSelectionChange?: (paths: string[]) => void;
  };

  let { ports, selectedPaths, onSelectionChange }: Props = $props();

  function toggleSelection(path: string) {
    const current = new Set(selectedPaths);
    if (current.has(path)) {
      current.delete(path);
    } else {
      current.add(path);
    }
    onSelectionChange?.(Array.from(current));
  }

  function isSelected(path: string): boolean {
    return selectedPaths.includes(path);
  }

  const columns: ColumnDef<AvailablePortRow>[] = [
    {
      id: "select",
      header: "",
      cell: ({ row }) => {
        const selected = isSelected(row.original.portInfo.path);
        return renderComponent(SelectCell, {
          selected,
          disabled: false,
          onclick: () => toggleSelection(row.original.portInfo.path),
        });
      },
    },
    {
      accessorKey: "portInfo.path",
      header: "Path",
      cell: ({ row }) => row.original.portInfo.path,
    },
    {
      id: "name",
      header: "Port Name",
      cell: ({ row }) => {
        const info = row.original.portInfo;
        return info.product ?? info.manufacturer ?? "—";
      },
    },
  ];

  // Use $derived to recreate table when ports changes
  const table = $derived(
    createSvelteTable({
      data: ports,
      columns,
      getCoreRowModel: getCoreRowModel(),
    }),
  );

  function getRowClass(row: AvailablePortRow): string {
    if (isSelected(row.portInfo.path)) return "bg-muted";
    return "cursor-pointer";
  }

  function handleRowClick(row: AvailablePortRow) {
    toggleSelection(row.portInfo.path);
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-auto rounded-md border">
    <Table.Root>
      <Table.Header>
        {#each table.getHeaderGroups() as headerGroup}
          <Table.Row>
            {#each headerGroup.headers as header}
              <Table.Head>
                {#if !header.isPlaceholder}
                  <FlexRender
                    content={header.column.columnDef.header}
                    props={header.getContext()}
                  />
                {/if}
              </Table.Head>
            {/each}
          </Table.Row>
        {/each}
      </Table.Header>
      <Table.Body>
        {#each table.getRowModel().rows as row}
          <Table.Row
            class={getRowClass(row.original)}
            onclick={() => handleRowClick(row.original)}
          >
            {#each row.getVisibleCells() as cell}
              <Table.Cell>
                <FlexRender
                  content={cell.column.columnDef.cell}
                  props={cell.getContext()}
                />
              </Table.Cell>
            {/each}
          </Table.Row>
        {:else}
          <Table.Row>
            <Table.Cell colspan={columns.length} class="h-24 text-center">
              No devices found.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
