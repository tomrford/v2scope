# TODO

## Runtime/UI

- [ ] Bootstrap error UI if settings/ports/runtime init fails (`src/routes/+layout.svelte`).
- [ ] Lock settings while device state RUNNING/ACQUIRING (runtime guard + UI disable).
- [ ] Saved/available device table filter (path/name/vid/pid).

## Rust

- [ ] Document lock-poisoning assumption in `src-tauri/src/serial.rs` or replace `expect` with recovery.

## Notes

- Snapshot validity timing: NOT_READY during ACQUIRING is expected.
- Protocol pre-release; no backward-compat.
- Multi-byte values honor GET_INFO endianness.
