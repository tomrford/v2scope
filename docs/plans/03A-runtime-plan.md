# Effect-TS Runtime Plan (Archived)

- Implemented in `src/lib/runtime/RuntimeService.ts`, `src/lib/runtime/DeviceService.ts`, `src/lib/runtime/DeviceManager.ts`.
- Runtime ↔ stores bridge in `src/lib/store/runtime.ts`.
- Retry policy: CRC-only, attempts via settings `crcRetryAttempts`.
- Polling config: `statePollingHz`, `framePollingHz`, `frameTimeoutMs`.
- Remaining gaps tracked in `docs/todos.md`.
