# Devices UI Flow

Structured workflow for device discovery, selection, connection, and status.

## Core concepts

- **Available devices**: list from `list_ports`
- **Selected devices**: user-curated set; persists across sessions
- **Active devices**: selected + connected + responding
- **Deactivated devices**: selected but intentionally inactive; show in Recents

## Devices page layout

- **Primary table**: Selected devices (rows persist when not connected)
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
4. Table shows columns: `status` (if already selected), `path`, `vid/pid`,
   `port name`.
5. User selects one or more rows.
6. User clicks **Add** (bottom-right).
7. Modal closes; selected devices appear in Selected table.
8. Background: attempt `connect` on new selections.

### Modal states

- **Loading**: spinner + “Listing devices…”
- **Empty**: “No devices found” + retry/refresh
- **Error**: show error detail + retry/refresh

### Modal selection rules

- Status column shows a compact badge for existing selected rows only
- Use only the three tracked states (Connected/Error/Deactivated)
- Disable rows already in Selected list
- Preserve multi-select across filters
- Optional search/filter for path/name/vendor
- Manual refresh button in modal header/footer

## Selected devices table

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
  - Remove from selected

## Connection workflow

- On add: optimistic row insert → attempt `connect`
- On success: status → Connected
- On failure: status → Error + tooltip with error type
- Retry available via right-click or row menu

## Deactivate vs remove

- **Deactivate**: stop polling and disconnect; keep in recents
- **Remove**: drop from selected and recents (explicit action)

## Resync all

- Button on Devices page
- Refresh `list_ports` first, then attempt `connect` only for
  - selected devices in Error state
  - paths present in the latest port list
- Skip Connected and Deactivated devices
- On app startup: attempt auto-connect for all selected devices present in the
  current port list; leave missing devices with no status badge

## Persistence

- Settings schema supports
  - `defaultSerialConfig`
  - `recentPorts[]` with `lastConfig` and `lastConnected`
- Selected devices derived from `recentPorts`, per-device settings from
  `recentPorts[].lastConfig` when present
- Recents show deactivated entries (read-only if device missing)

## Edge cases to handle

- Device unplugged: likely surfaces as Error; keep error state
- Duplicate paths: unlikely; if list returns duplicates, collapse by path
- Permission/lock errors: show actionable error text
- Stale port list: allow refresh (modal + page)
