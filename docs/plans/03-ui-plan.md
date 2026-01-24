# UI plan (Svelte + plotting)

## Principles

- One-page control surface + plot area
- Robust device management, no global failure cascade
- Clear state: running/stop/acquiring/error
- Snapshots as first-class timeline items

## Layout sketch (adaptable)

- Left rail: device list + status + filters
- Main column:
  - Top: VScope controls (refresh/run/trigger/save + timing)
  - Middle: RT buffers (16 inputs + labels)
  - Bottom: snapshots list/table
- Right column: live plots (stacked 5 channels)
- Tabs / fullscreen:
  - Live view
  - Snapshot compare view
  - Fullscreen single snapshot

## Plotting needs

- Fast line plotting with large arrays
- Multi-device overlays per channel
- Toggle visibility + per-channel labels
- Fullscreen + tabs

## Plotting options (needs selection)

- uPlot (fast, low-level)
- ECharts (feature-rich, heavier)
- Plotly (heavy; ok for analysis, less for live)
- Custom Canvas/WebGL (fast but time cost)

## Channel selector UX

- Popover/modal for channel mapping
- Show variable list (search + filter)
- Show current mapping (5 slots)
- Apply mapping + show ack/error

## Device robustness UX

- Device cards with health status
- Per-device error counters and reconnect controls
- If device drops: mark degraded, keep others alive
- Manual re-handshake per device

## Snapshot UX

- Table/list with timing + description + device count
- Actions: plot, compare, export, delete
- Compare requires matching metadata

## Open questions

- How many plots visible by default?
- Do we need per-device color palette config?
- Snapshot diff view? (delta between snapshots)
- Export formats: CSV only or add binary/JSON?
- Desired mobile support? (currently desktop-only ok)
