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
- TS/UI: update GET_VAR_LIST/GET_RT_LABELS decode + request payloads (required start/count, no per-entry id).
- TS/UI: parse GET_INFO endianness + swap all multi-byte fields when host endianness differs.
- UI: poll available ports list instead of manual refresh.
- Settings: enforce max live buffer size (derived from frame polling Hz + duration).
- Settings: consider exposing only buffer duration; cap internal sampling frequency to honor max buffer size (drop Hz as duration grows).

## Runed notes

- FiniteStateMachine: actions, \_enter/\_exit, wildcard "\*", debounce; good for UI gating by sync state.
- Context/PersistedState/StateHistory, Debounced/Throttled, watch, resource, useInterval, useEventListener, boolAttr.
