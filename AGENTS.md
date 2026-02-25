# VScope Rewrite

Tauri + Rust + Svelte rewrite of the vscope debug interface for embedded microcontrollers. Virtual oscilloscope (vscope) for viewing stored high-resolution runs as snapshots, plus real-time buffers (rtbuffers) for live control.

We are building this pre-release. DO NOT under any circumstances value backwards compatibility whilst the application is unfinished and unused. Assume there is no historical data to migrate unless explicitly instructed otherwise.

## Architecture

**Rust (src-tauri):** Serial port discovery/open/close, transport framing (CRSF-style: SYNC|LEN|TYPE|PAYLOAD|CRC), CRC, request/response, snapshot cache I/O. Keep Rust sync/simple; avoid complex async.

**TypeScript/Effect (src):** Device lifecycle, polling loops (state @20Hz, frame @10Hz), retry/backoff, UI state, multi-device coordination.

**Svelte UI:** One-page control panel + live plot area.
**UI components:** shadcn-svelte components in `src/lib/components/ui` for most UI.

## Key Concepts

- **Channels:** 5 selectable from device variable catalog via channel mapping
- **RT Buffers:** 16 float values (trigger params + user values)
- **Snapshots:** Stored on-device, downloaded post-acquisition, cached locally with metadata
- **Multi-device:** All devices must match channels/buffer/labels; equality checks on responses

## Protocol (CRSF-inspired framing)

Frame: `SYNC | LEN | TYPE | PAYLOAD | CRC8/16`

Message families: GET_INFO, GET/SET_TIMING, GET/SET_STATE, TRIGGER, GET_FRAME, GET_SNAPSHOT_HEADER/DATA, GET/SET_CHANNEL_MAP, GET_VAR_LIST, GET_RT_LABELS

## Commands

```bash
bun run dev      # dev server
bun run build    # production build
bun run check    # svelte-check + tsc
bun pm view <pkg>  # dependency metadata checks
cargo check      # rust check (in src-tauri)
cargo fmt        # rust format
bunx prettier --write .  # ts/svelte format
```

## Docs

See `docs/plans/` for detailed specs:

- `00-current-overview.md` - current Python app behavior + protocol reference
- `01-c-transport-and-channels.md` - C transport framing + channel selection
- `02-rust-ts-boundary.md` - Rust/TS responsibility split
- `03-ui-plan.md` - UI layout + plotting options

## Project memory

- Onboard C: snapshot header now returns dynamic metadata (channel map, divider, pre_trig, trigger params, rt values); snapshot validity set false on RUNNING, true only on ACQUIRING->HALTED; header/data return NOT_READY if invalid.
- GET_INFO extended with rt_count/rt_buffer_len/name_len; name len now 16; device name provided by caller (no default).
- First_element remains internal only; client uses GET_INFO buffer_size.

## TODOs

- TS/UI: update GET_SNAPSHOT_DATA decode + requests for sample-major ordering (contiguous chunks).
- Settings: enforce max live buffer size (derived from frame polling Hz + duration).
- Settings: consider exposing only buffer duration; cap internal sampling frequency to honor max buffer size (drop Hz as duration grows).

## Runed notes

- FiniteStateMachine: actions, \_enter/\_exit, wildcard "\*", debounce; good for UI gating by sync state.
- Context/PersistedState/StateHistory, Debounced/Throttled, watch, resource, useInterval, useEventListener, boolAttr.

## Cursor Cloud specific instructions

### System dependencies (pre-installed on VM)

Tauri v2 Linux system libs are required for `cargo check`/`cargo build` in `src-tauri/`:
`libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libssl-dev libudev-dev libjavascriptcoregtk-4.1-dev librsvg2-dev pkg-config build-essential`

Rust stable >= 1.85 is required (the `home` crate uses `edition2024`). The VM ships with `rustup`; ensure `rustup default stable` points to a recent enough version.

### Running the app

- **Frontend only:** `bun run dev` (Vite on port 1420)
- **Full Tauri desktop:** `bun run tauri dev` — compiles Rust + launches Vite + opens the WebKit window. Requires `$DISPLAY` (set to `:1` on Cloud VMs). Ignore `libEGL warning: DRI3` — GPU accel is unavailable in the VM but the app works fine.
- Kill any leftover process on port 1420 before running `bun run tauri dev`; the Tauri CLI's `beforeDevCommand` (`bun run dev`) will fail if the port is occupied.

### Tests

- **TS tests:** `bun test` (uses `bun:test`; no `test` script in `package.json`)
- **Rust tests:** `cargo test` in `src-tauri/`
- **Lint:** `bun run lint` (ESLint) — pre-existing warnings may exist
- **Type check:** `bun run check` (svelte-check + tsc)
- **Rust check:** `cargo check` in `src-tauri/`
- **Format check:** `bun run format:check` / `cargo fmt --check`

### Gotchas

- No physical serial device is available in the VM, so the Devices page will show "No devices found." This is expected.
- The `flake.nix` only provides a Rust toolchain; Bun and Tauri system libs are **not** provided by Nix in this project. On Cloud VMs, use the globally installed Bun instead.
