<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    createSvelteTable,
    FlexRender,
    getCoreRowModel,
    getFilteredRowModel,
    renderComponent,
    type ColumnDef,
    type ColumnFiltersState,
  } from "$lib/components/ui/data-table/index.js";
  import type { AvailablePortRow } from "./types.js";
  import DeviceStatusBadge from "./device-status-badge.svelte";
  import SelectCell from "./select-cell.svelte";

  type Props = {
    ports: AvailablePortRow[];
    selectedPaths: string[];
    onSelectionChange?: (paths: string[]) => void;
  };

  let { ports, selectedPaths, onSelectionChange }: Props = $props();

  let columnFilters: ColumnFiltersState = $state([]);

  function toggleSelection(path: string, alreadySaved: boolean) {
    if (alreadySaved) return;

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
        const disabled = row.original.alreadySaved;
        return renderComponent(SelectCell, {
          selected,
          disabled,
          onclick: () =>
            toggleSelection(row.original.portInfo.path, row.original.alreadySaved),
        });
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        if (!row.original.alreadySaved) return "";
        return renderComponent(DeviceStatusBadge, {
          status: row.original.savedStatus ?? "unknown",
        });
      },
    },
    {
      accessorKey: "portInfo.path",
      header: "Path",
      cell: ({ row }) => row.original.portInfo.path,
      filterFn: (row, _columnId, filterValue: string) => {
        const searchLower = filterValue.toLowerCase();
        const info = row.original.portInfo;
        return (
          info.path.toLowerCase().includes(searchLower) ||
          (info.product?.toLowerCase().includes(searchLower) ?? false) ||
          (info.manufacturer?.toLowerCase().includes(searchLower) ?? false)
        );
      },
    },
    {
      id: "vidpid",
      header: "VID/PID",
      cell: ({ row }) => {
        const { vid, pid } = row.original.portInfo;
        if (vid === null && pid === null) return "—";
        const vidStr = vid?.toString(16).toUpperCase().padStart(4, "0") ?? "????";
        const pidStr = pid?.toString(16).toUpperCase().padStart(4, "0") ?? "????";
        return `${vidStr}:${pidStr}`;
      },
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

  const table = createSvelteTable({
    get data() {
      return ports;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: (updater) => {
      if (typeof updater === "function") {
        columnFilters = updater(columnFilters);
      } else {
        columnFilters = updater;
      }
    },
    state: {
      get columnFilters() {
        return columnFilters;
      },
    },
  });

  function handleFilterInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    table.getColumn("portInfo.path")?.setFilterValue(value);
  }

  function getRowClass(row: AvailablePortRow): string {
    if (row.alreadySaved) return "opacity-50 cursor-not-allowed";
    if (isSelected(row.portInfo.path)) return "bg-muted";
    return "cursor-pointer";
  }

  function handleRowClick(row: AvailablePortRow) {
    if (!row.alreadySaved) {
      toggleSelection(row.portInfo.path, row.alreadySaved);
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Input
      placeholder="Search ports..."
      value={(table.getColumn("portInfo.path")?.getFilterValue() as string) ?? ""}
      oninput={handleFilterInput}
      class="max-w-sm"
    />
  </div>

  <div class="rounded-md border">
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

  <div class="text-muted-foreground text-sm">
    {selectedPaths.length} selected of {ports.filter((p) => !p.alreadySaved).length}
    available
  </div>
</div>
