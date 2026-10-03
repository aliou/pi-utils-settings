---
"@aliou/pi-utils-settings": minor
---

Refactor internals for depth and testability; no behavior changes.

- **`SectionedSettings` takes a single options object** (`{ sections, maxVisible?, theme, onChange, onCancel, ... }`) instead of positional arguments, matching every other component. Nothing else constructed it in known consumers, so resolution is mechanical.
- **Removed unused `SectionedSettings.updateValue`** — no internal or consumer usage.
- **`defaultChangeHandler` is no longer re-exported from `@aliou/pi-utils-settings/settings-command`**; it lives in the panel module. It was never exported from the package root.
- **New internal modules**: `settings-panel.ts` (the framed panel is now a `SettingsPanel implements Component` class; `ctx.ui.custom` just constructs it) and `settings-tabs.ts` (scope labels, tab types, tab-list building).
- **`config-loader.ts` split** the pure version/semver/stamping math into `config-version.ts`.
- **Corrupted config files now log a `[settings] Failed to parse config …` error** instead of being silently treated as missing.
- **Test support**: shared `src/test/` helpers (identity theme, key constants, render assertions) and a harness that captures all registered commands and passes `args` as a string, matching the real pi contract.
