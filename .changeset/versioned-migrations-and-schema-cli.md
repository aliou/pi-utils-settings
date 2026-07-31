---
"@aliou/pi-utils-settings": minor
---

- Versioned migrations: `Migration.version` (monotonic int) auto-stamps the config file; `shouldRun` defaults to a version comparison; `run`/`shouldRun`/message factory receive a `MigrationContext` with applied-migration history. `ConfigLoader.getVersion()` reads the stamped version.
- Ctrl+S now saves from within nested submenus (ArrayEditor, SettingsDetailEditor, FuzzySelector, etc.); new `requestSave` option on submenu/component options for standalone use.
- `createConfigStore(loader, { scopes })` helper replaces hand-written ConfigStore wrappers.
- `pi-settings-schema` CLI wraps ts-json-schema-generator, auto-injects `$schema` + `version`, and supports `--check`. Also exported programmatically as `finalizeSchema`/`generateSettingsSchema`. ts-json-schema-generator is now an optional peerDependency.
