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
  import {
    type SavedDeviceRow,
    getDeviceStatus,
    getDeviceDisplayName,
  } from "./types.js";
  import DeviceStatusBadge from "./device-status-badge.svelte";
  import SavedDeviceActions from "./saved-device-actions.svelte";
  import SettingsBadge from "./settings-badge.svelte";
  import type { SerialConfig } from "$lib/transport/serial.schema";
  import type { PortInfo } from "$lib/transport/serial.schema";
  import { defaultSerialConfig } from "$lib/store/settings";

  type Props = {
    devices: SavedDeviceRow[];
    onShowInfo?: (row: SavedDeviceRow) => void;
    onEditSettings?: (row: SavedDeviceRow) => void;
    onRetryConnect?: (row: SavedDeviceRow) => void;
    onToggleActive?: (row: SavedDeviceRow) => void;
    onRemove?: (row: SavedDeviceRow) => void;
  };

  let {
    devices,
    onShowInfo,
    onEditSettings,
    onRetryConnect,
    onToggleActive,
    onRemove,
  }: Props = $props();

  let columnFilters: ColumnFiltersState = $state([]);

  const serialDefaults = $derived($defaultSerialConfig);

  const formatVidPid = (portInfo?: PortInfo | null): string => {
    if (!portInfo) return "—";
    const { vid, pid } = portInfo;
    if (vid === null && pid === null) return "—";
    const vidStr = vid?.toString(16).toUpperCase().padStart(4, "0") ?? "????";
    const pidStr = pid?.toString(16).toUpperCase().padStart(4, "0") ?? "????";
    return `${vidStr}:${pidStr}`;
  };

  const formatSerialSummary = (config: SerialConfig): string => {
    const bits =
      config.dataBits === "Five"
        ? "5"
        : config.dataBits === "Six"
          ? "6"
          : config.dataBits === "Seven"
            ? "7"
            : "8";
    const parity =
      config.parity === "None" ? "N" : config.parity === "Odd" ? "O" : "E";
    const stopBits = config.stopBits === "One" ? "1" : "2";
    return `${config.baudRate} baud, ${bits}${parity}${stopBits}, timeout ${config.readTimeoutMs}ms`;
  };

  const columns: ColumnDef<SavedDeviceRow>[] = [
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = getDeviceStatus(
          row.original.session,
          row.original.isActive,
        );
        const errorMessage = row.original.session?.error?.type ?? null;
        return renderComponent(DeviceStatusBadge, { status, errorMessage });
      },
    },
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => getDeviceDisplayName(row.original),
      filterFn: (row, _columnId, filterValue: string) => {
        const searchLower = filterValue.toLowerCase();
        const displayName = getDeviceDisplayName(row.original).toLowerCase();
        const path = row.original.port.path.toLowerCase();
        return displayName.includes(searchLower) || path.includes(searchLower);
      },
    },
    {
      accessorKey: "port.path",
      header: "Path",
      cell: ({ row }) => row.original.port.path,
    },
    {
      id: "vidpid",
      header: "VID/PID",
      cell: ({ row }) => {
        return formatVidPid(row.original.portInfo);
      },
    },
    {
      id: "settings",
      header: "Settings",
      cell: ({ row }) => {
        const hasOverride = Boolean(row.original.port.lastConfig);
        const activeConfig =
          row.original.port.lastConfig ?? serialDefaults ?? undefined;
        const summary = activeConfig
          ? `${hasOverride ? "Custom" : "Default"}: ${formatSerialSummary(activeConfig)}`
          : hasOverride
            ? "Custom serial settings"
            : "Default serial settings";
        return renderComponent(SettingsBadge, { hasOverride, summary });
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        renderComponent(SavedDeviceActions, {
          row: row.original,
          onShowInfo,
          onEditSettings,
          onRetryConnect,
          onToggleActive,
          onRemove,
        }),
    },
  ];

  const table = createSvelteTable({
    get data() {
      return devices;
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
    table.getColumn("name")?.setFilterValue(value);
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Input
      placeholder="Search devices..."
      value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
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
          <Table.Row data-state={row.getIsSelected() ? "selected" : undefined}>
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
              No devices saved. Click "Add Devices" to get started.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <div class="text-sm text-muted-foreground">
    {table.getFilteredRowModel().rows.length} of {devices.length} device(s)
  </div>
</div>
