# TODO

## Runtime/UI

- [x] Bootstrap error UI if settings/ports/runtime init fails (`src/routes/+layout.svelte`).
- [ ] Lock settings while device state RUNNING/ACQUIRING (runtime guard + UI disable).
- [ ] Saved/available device table filter (path/name/vid/pid).

## Rust

- [x] Lock-poisoning handling in `src-tauri/src/serial.rs` now recovers with typed errors (no `expect` panics).

## Notes

- Snapshot validity timing: NOT_READY during ACQUIRING is expected.
- Protocol pre-release; no backward-compat.
- Multi-byte values honor GET_INFO endianness.
