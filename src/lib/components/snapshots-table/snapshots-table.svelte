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
  import type { SnapshotEntry } from "$lib/store/snapshots.js";
  import SnapshotActions from "./snapshot-actions.svelte";
  import SnapshotStatusBadge from "./snapshot-status-badge.svelte";

  type Props = {
    snapshots: SnapshotEntry[];
    onPlot?: (entry: SnapshotEntry) => void;
    onCompare?: (entry: SnapshotEntry) => void;
    onSave?: (entry: SnapshotEntry) => void;
    onExport?: (entry: SnapshotEntry) => void;
    onDelete?: (entry: SnapshotEntry) => void;
    onRename?: (entry: SnapshotEntry) => void;
  };

  let {
    snapshots,
    onPlot,
    onCompare,
    onSave,
    onExport,
    onDelete,
    onRename,
  }: Props = $props();

  let columnFilters: ColumnFiltersState = $state([]);

  const columns: ColumnDef<SnapshotEntry>[] = [
    {
      accessorKey: "meta.name",
      header: "Name",
      cell: ({ row }) => row.original.meta.name,
      filterFn: (row, _columnId, filterValue: string) => {
        const searchLower = filterValue.toLowerCase();
        const meta = row.original.meta;
        // Search across multiple fields
        return (
          meta.name.toLowerCase().includes(searchLower) ||
          meta.deviceNames.some((d) => d.toLowerCase().includes(searchLower)) ||
          meta.createdAt.toLowerCase().includes(searchLower)
        );
      },
    },
    {
      accessorKey: "meta.deviceNames",
      header: "Devices",
      cell: ({ row }) => row.original.meta.deviceNames.join(", "),
    },
    {
      accessorKey: "meta.channelCount",
      header: "Channels",
      cell: ({ row }) => row.original.meta.channelCount,
    },
    {
      accessorKey: "meta.sampleCount",
      header: "Samples",
      cell: ({ row }) => row.original.meta.sampleCount.toLocaleString(),
    },
    {
      accessorKey: "meta.createdAt",
      header: "Created",
      cell: ({ row }) => {
        const date = new Date(row.original.meta.createdAt);
        return date.toLocaleString();
      },
    },
    {
      accessorKey: "persisted",
      header: "Status",
      cell: ({ row }) =>
        renderComponent(SnapshotStatusBadge, {
          persisted: row.original.persisted,
        }),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        renderComponent(SnapshotActions, {
          entry: row.original,
          onPlot,
          onCompare,
          onSave,
          onExport,
          onDelete,
          onRename,
        }),
    },
  ];

  const table = createSvelteTable({
    get data() {
      return snapshots;
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
    table.getColumn("meta.name")?.setFilterValue(value);
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Input
      placeholder="Search snapshots..."
      value={(table.getColumn("meta.name")?.getFilterValue() as string) ?? ""}
      oninput={handleFilterInput}
      class="max-w-sm"
    />
  </div>

  <div class="rounded-md border">
    <Table.Root>
      <Table.Header>
        {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
          <Table.Row>
            {#each headerGroup.headers as header (header.id)}
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
        {#each table.getRowModel().rows as row (row.id)}
          <Table.Row data-state={row.getIsSelected() ? "selected" : undefined}>
            {#each row.getVisibleCells() as cell (cell.id)}
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
              No snapshots found.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <div class="text-sm text-muted-foreground">
    {table.getFilteredRowModel().rows.length} of {snapshots.length} snapshot(s)
  </div>
</div>
