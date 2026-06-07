---
"@aliou/pi-utils-settings": minor
---

Add optional `message` field to `Migration` interface for user-facing migration notifications

Migrations can now declare a `message` that is queued when the migration runs successfully.
Extensions drain messages via `ConfigLoader.drainMessages()` and display them however they want
(typically via `ctx.ui.notify` in `session_start`).

- `Migration.message`: `string | ((before, after, filePath) => string | undefined)`
  - Static strings are used as-is
  - Factory functions receive both pre-migration and post-migration config
  - Returning `undefined` from a factory skips the message
- `drainMessages()` returns `string[]`, queue is cleared on drain
- Failed migrations do not queue messages
- Message factory errors are caught gracefully (logged, not queued)
