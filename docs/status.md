# Status

- C implementation in `onboard/vscope.c` is feature-complete and frozen; treat as protocol source of truth.
- No backward compatibility planned.
- Remaining work is host-side only (TS/UI): handle GET_INFO endianness, sample-major snapshot chunks, and (start,count) list requests with no per-entry id.
