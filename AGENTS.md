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

### Nix-based dev environment

All tooling (Rust, Bun, pkg-config, Tauri system libs on Linux) comes from `flake.nix`. The VM environment snapshot installs Nix, enables `nix-command flakes` in `/etc/nix/nix.conf`, and starts `nix-daemon`. All build/run/test commands must be prefixed with `nix develop -c`:

```bash
nix develop -c <cmd>   # e.g. bun install, cargo check, bun run tauri dev
```

The Nix-provided Rust toolchain links against Nix glibc, so system-installed libs (`apt`) are **not** compatible at runtime. The flake's devShell includes all native deps and sets `LD_LIBRARY_PATH` via `shellHook`. Do **not** install Tauri system deps via `apt` — the flake provides them.

### Running the app

- **Frontend only:** `nix develop -c bun run dev` (Vite on port 1420)
- **Full Tauri desktop:** `nix develop -c bun run tauri dev` — compiles Rust + launches Vite + opens the WebKit window. Requires `$DISPLAY` (set to `:1` on Cloud VMs). Ignore EGL/DRI3 warnings — GPU accel is unavailable in the VM but the app works fine.
- Kill any leftover process on port 1420 before running `tauri dev`; the Tauri CLI's `beforeDevCommand` will fail if the port is occupied.

### Tests

All commands run inside `nix develop -c`:

- **TS tests:** `nix develop -c bun test` (uses `bun:test`; no `test` script in `package.json`)
- **Rust tests:** `nix develop -c sh -c 'cd src-tauri && cargo test'`
- **Lint:** `nix develop -c bun run lint` (ESLint) — pre-existing warnings may exist
- **Type check:** `nix develop -c bun run check` (svelte-check + tsc)
- **Rust check:** `nix develop -c sh -c 'cd src-tauri && cargo check'`
- **Format check:** `nix develop -c bun run format:check` / `nix develop -c sh -c 'cd src-tauri && cargo fmt --check'`

### Gotchas

- No physical serial device is available in the VM, so the Devices page shows "No devices found." This is expected.
- Do **not** mix system Rust (`rustup`) with Nix-provided Rust. Always use `nix develop -c` to get consistent toolchain + libraries.
- The `nix-daemon` must be running for `nix develop` to work. The update script ensures this. If `nix develop` fails with a socket error, run: `sudo /nix/var/nix/profiles/default/bin/nix-daemon &`
