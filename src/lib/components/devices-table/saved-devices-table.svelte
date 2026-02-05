<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    createSvelteTable,
    FlexRender,
    getCoreRowModel,
    renderComponent,
    type ColumnDef,
  } from "$lib/components/ui/data-table/index.js";
  import {
    type SavedDeviceRow,
    getDeviceStatus,
    getDeviceDisplayName,
  } from "./types.js";
  import DeviceStatusBadge from "./device-status-badge.svelte";
  import SavedDeviceActions from "./saved-device-actions.svelte";

  type Props = {
    devices: SavedDeviceRow[];
  };

  let { devices }: Props = $props();

  const columns: ColumnDef<SavedDeviceRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => getDeviceDisplayName(row.original),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        renderComponent(DeviceStatusBadge, {
          status: getDeviceStatus(
            row.original.session,
            row.original.isActive,
            Boolean(row.original.mismatch),
          ),
          error:
            (row.original.mismatch
              ? {
                  type: "mismatch",
                  message: row.original.mismatch.message,
                }
              : null) ??
            row.original.session?.deviceError ??
            null,
          hasOverride: Boolean(row.original.port.lastConfig),
        }),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        renderComponent(SavedDeviceActions, {
          row: row.original,
        }),
    },
  ];

  // Use $derived to recreate table when devices changes
  const table = $derived(
    createSvelteTable({
      data: devices,
      columns,
      getCoreRowModel: getCoreRowModel(),
    }),
  );
</script>

<div class="flex h-full flex-col gap-3">
  <div class="flex-1 overflow-auto rounded-md border">
    <Table.Root>
      <Table.Header>
        {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
          <Table.Row>
            {#each headerGroup.headers as header (header.id)}
              <Table.Head
                class={header.id === "status"
                  ? "text-right"
                  : header.id === "actions"
                    ? "w-10"
                    : ""}
              >
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
              <Table.Cell
                class={cell.column.id === "status"
                  ? "text-right"
                  : cell.column.id === "actions"
                    ? "w-10 p-0"
                    : ""}
              >
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
              No devices saved. Add a port from the list on the right.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
