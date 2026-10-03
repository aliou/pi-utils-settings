---
"@aliou/pi-utils-settings": minor
---

Reorganize internals for depth and testability.

- **`SectionedSettings` takes a single options object** (`{ sections, maxVisible?, theme, onChange, onCancel, ... }`) instead of positional arguments, matching every other component. Nothing else constructed it in known consumers, so resolution is mechanical.
- **Removed unused `SectionedSettings.updateValue`** — no internal or consumer usage.
- **`defaultChangeHandler` is no longer re-exported from `@aliou/pi-utils-settings/settings-command`**; it lives in the panel module. It was never exported from the package root.
- **New layout**: component classes live in `components/` (including the new `SettingsPanel implements Component`, which `registerSettingsCommand`'s `ctx.ui.custom` callback just constructs), config infrastructure in `config/` (loader, version math, schema helpers), and shared domain types (scopes, tabs, section-builder contracts) in `types.ts`.
- **Corrupted config files no longer fail silently**: the loader queues a `[settings] Failed to parse config …` message on its existing `drainMessages()` channel — drain on `session_start` and show via `ctx.ui.notify` with the fresh context. Migration failures and broken message factories use the same channel. No `console.*` anywhere in library code (it corrupts the TUI layout).
- **Test support**: shared `src/test/` helpers (identity theme, key constants, render assertions, the settings command harness), excluded from the npm tarball. The harness captures all registered commands and passes `args` as a string, matching the real pi contract.
