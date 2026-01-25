# Devices UI Flow

Structured workflow for device discovery, selection, connection, and status.

## Core concepts

- **Available devices**: list from `list_ports`
- **Saved devices**: user-curated set; persists across sessions
- **Active devices**: saved + connected + responding
- **Inactive devices**: saved but intentionally inactive; show in Saved list

## Devices page layout

- **Primary table**: Saved devices (rows persist when not connected)
- **Indicators**: status dot + text badge per row
- **Actions**: add devices, resync all, default serial settings, per-row menu

## Status indicators

- **Connected**: green dot, “Connected” label
- **Error**: red dot, “Error” label + hover tooltip with error type
- **Deactivated**: gray dot, “Deactivated” label

No badge means no successful connect attempt yet or device missing.

## Add devices modal

1. User clicks **Add Devices** button.
2. Modal opens with loading state.
3. Call `list_ports`; on success render table.
4. Table shows columns: `status` (if already saved), `path`, `vid/pid`,
   `port name`.
5. User selects one or more rows.
6. User clicks **Add** (bottom-right).
7. Modal closes; saved devices appear in Saved table.
8. Background: attempt `connect` on new actives.

### Modal states

- **Loading**: spinner + “Listing devices…”
- **Empty**: “No devices found” + retry/refresh
- **Error**: show error detail + retry/refresh

### Modal selection rules

- Status column shows a compact badge for existing saved rows only
- Use only the three tracked states (Connected/Error/Inactive)
- Disable rows already in Saved list
- Preserve multi-select across filters
- Optional search/filter for path/name/vendor
- Manual refresh button in modal header/footer

## Saved devices table

Columns (suggested):

- Status
- Device name (from GET_INFO when connected; fallback to path)
- Path
- VID/PID
- Port settings marker (default vs override) + tooltip summary

Default serial settings action opens Settings modal at serial section.

Row actions:

- **Context menu / kebab**
  - Show device info (GET_INFO fields)
  - Edit serial settings (per-device override)
  - Retry connect
  - Deactivate / Activate toggle
  - Remove from saved

## Connection workflow

- On add: optimistic row insert → attempt `connect`
- On success: status → Connected
- On failure: status → Error + tooltip with error type
- Retry available via right-click or row menu

## Deactivate vs remove

- **Deactivate**: stop polling and disconnect; keep in saved
- **Remove**: drop from saved (explicit action)

## Resync all

- Button on Devices page
- Refresh `list_ports` first, then attempt `connect` only for
  - active devices in Error state
  - paths present in the latest port list
- Skip Connected and Inactive devices
- On app startup: attempt auto-connect for all active devices present in the
  current port list; leave missing devices with no status badge

## Persistence

- Settings schema supports
  - `defaultSerialConfig`
- `savedPorts[]` with `lastConfig`
- Active devices derived from `activePorts`, per-device settings from
  `savedPorts[].lastConfig` when present

## Edge cases to handle

- Device unplugged: likely surfaces as Error; keep error state
- Duplicate paths: unlikely; if list returns duplicates, collapse by path
- Permission/lock errors: show actionable error text
- Stale port list: allow refresh (modal + page)
