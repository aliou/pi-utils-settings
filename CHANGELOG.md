# @aliou/pi-utils-settings

## 0.21.0

### Minor Changes

- c405645: Add a `header` field type to `SettingsDetailEditor`: a dim, non-interactive row skipped by navigation and Enter, with an optional dim value in the value column. Use it as a section divider inside a long field list or as an inert placeholder row (e.g. entries that exist in config but cannot be edited right now).

## 0.20.0

### Minor Changes

- 05bdf78: `SectionedSettings`' `contentHeight` is now a true flex layout instead of pad-only: the item list window shrinks to make room for the selected item's description, which is wrapped in full (never truncated, no ellipsis) and bottom-anchored just above the hint line, while blank padding between the list and the description keeps the content at exactly the configured number of lines. This replaces the rejected `fixedDescriptionLines` truncation approach, which has been removed. `SettingsDetailEditor` gains a matching `contentHeight` option: in list mode the field window shrinks for the bottom-anchored, fully wrapped description, and its other modes (text editing, choice selector, empty state) pad to the fixed height so the panel never changes size. `registerSettingsCommand` accepts a new `contentHeight` option (default 20) wired to the settings body, replacing its previously hardcoded layout values. When `contentHeight` is unset, both components render exactly as before.
- 7e0ec5f: Add a `contentHeight` option to `SectionedSettings`: the rendered body is held at exactly the given number of lines, so the panel height stays stable across tabs and cursor moves (same goal as the Wizard's `minContentHeight` option). `registerSettingsCommand` passes a `contentHeight` of 20 by default, so the settings panel no longer jumps in height when switching tabs. See the flex-content-height-layout changeset for the layout details.
- 7e60ea4: Unframed submenu components: `FuzzySelector`, `FuzzyMultiSelector`, `ArrayEditor`, and `PathArrayEditor` no longer wrap their output in a bordered `Panel` — they render a plain styled title line followed by the body at full width, so they sit cleanly inside the `registerSettingsCommand` panel's own border instead of drawing a nested box. The internal `renderSettingsPanel` helper was removed (no replacement API; the old bordered layout has no supported opt-in). Each component now implements `getShortcuts(): string | undefined` (the `SettingsSubmenuComponent` contract), returning the shortcuts for its current internal mode (list vs add/edit input for the array editors, search vs no-matches for `FuzzySelector`), and accepts a `hideHint` option (default `false`) that suppresses its own shortcut footer when a host panel renders the single controls line — pass `hideHint: ctx.hideHint` from the submenu factory. For `FuzzyMultiSelector`, which already had a public `showHints` option (default `true`), `hideHint` takes precedence and wins over `showHints` when both are set.
- 5d259ea: Unified shortcut line: the settings panel from `registerSettingsCommand` now renders exactly one controls line at any time, always below the separator. Submenu components can implement `getShortcuts(): string | undefined` (new `SettingsSubmenuComponent` contract) to expose the shortcuts they currently respond to; while a submenu is open, the panel's controls line shows those instead of the default `Enter/Space change · Ctrl+S save · Esc close` (falling back to the default when the submenu exposes none). `SectionedSettings` gains `getActiveSubmenuShortcuts()` and forwards its `hideHint` option through the submenu factory context (`SettingsSubmenuContext.hideHint`). `SettingsDetailEditor` implements `getShortcuts()` per mode (list / text editing / enum choice / confirm / empty state, delegating to nested submenus) and accepts a new `hideHint` option that suppresses its own hint footer lines while keeping the fixed `contentHeight` layout — pass `hideHint: ctx.hideHint` when hosting it from `registerSettingsCommand`. Esc semantics stay accurate (with a submenu open, Esc backs out of the submenu), and Ctrl+S still saves from any depth.

## 0.19.2

### Patch Changes

- 5778092: chore(deps): bump @aliou/pi-utils-ui to ^0.5.0

## 0.19.1

### Patch Changes

- e7bcf06: Support semver strings as migration versions. `Migration.version` now accepts a non-negative integer or a semver string (e.g. `"1.2.0"`, the extension's package version), so extensions can version configs with their own release version instead of a parallel integer counter. All versioned migrations in one loader must use the same scheme; mixing integers and semver strings throws at construction. Prerelease/build metadata is not supported. `getVersion()` and `MigrationContext.fromVersion`/`toVersion` are now typed `number | string` — runtime behavior is unchanged for integer-versioned loaders, but TypeScript consumers coercing these to `number` need a type guard.

## 0.19.0

### Minor Changes

- 09a5603: - Versioned migrations: `Migration.version` (monotonic int) auto-stamps the config file; `shouldRun` defaults to a version comparison; `run`/`shouldRun`/message factory receive a `MigrationContext` with applied-migration history. `ConfigLoader.getVersion()` reads the stamped version.
  - Ctrl+S now saves from within nested submenus (ArrayEditor, SettingsDetailEditor, FuzzySelector, etc.); new `requestSave` option on submenu/component options for standalone use.
  - `createConfigStore(loader, { scopes })` helper replaces hand-written ConfigStore wrappers.
  - `pi-settings-schema` CLI wraps ts-json-schema-generator, auto-injects `$schema` + `version`, and supports `--check`. Also exported programmatically as `finalizeSchema`/`generateSettingsSchema`. ts-json-schema-generator is now an optional peerDependency.

## 0.18.0

### Minor Changes

- 245765e: Submenu factories now receive a `{ requestRender: () => void }` context so async-loaded submenus can trigger a redraw.

  - `SectionedSettings` submenu signature is `(currentValue, done, ctx) => Component`.
  - `SettingsDetailEditor` nested submenu signature is `(done, ctx) => Component`.
  - `registerSettingsCommand` wires the real `tui.requestRender()` hook automatically.
  - Standalone `SectionedSettings` / `SettingsDetailEditor` users can pass `requestRender` in options.
  - Existing 2-argument submenu factories remain compatible.

### Patch Changes

- 2f1b07e: Extra tabs can now handle value-cycling setting items with an explicit `onSettingChange` callback. The callback receives `applySettingChangeToScope(...)`, which reuses the command-level setting change handler and writes the result into the chosen scope draft so Ctrl+S persists it.

  Also align `onSettingChange` behavior with the docs: returning `null` falls through to the default dotted-path string storage.

## 0.17.0

### Minor Changes

- a9e9152: Add optional `message` field to `Migration` interface for user-facing migration notifications

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

## 0.16.0

### Minor Changes

- 923804e: Allow `buildSchemaUrl` callers to customize schema hosting URLs with `baseUrl` or `template` options.
- ec86921: Add `onBeforeClose` to intercept settings UI close requests before discarding drafts.

## 0.15.1

### Patch Changes

- 3e9eede: fix: resolve type errors and bump @aliou/pi-utils-ui to ^0.4.1

## 0.15.0

### Minor Changes

- af07e77: Update dependencies to use `@earendil-works/pi-` packages and bump `@aliou/pi-utils-ui` to v0.4.0

## 0.14.1

### Patch Changes

- 17e3b5e: Make `@aliou/pi-utils-ui` a regular dependency instead of an optional peer dependency.

## 0.14.0

### Minor Changes

- 405e0e5: Update settings editor components to render inside shared `@aliou/pi-utils-ui` panels while preserving the existing pi-utils-settings component APIs.

## 0.13.0

### Minor Changes

- cb080f5: Remove `displayToStorageValue` helper. The default change handler now stores raw strings as-is instead of coercing "on"/"off"/"enabled"/"disabled" to booleans. Use `onSettingChange` to convert display values to the correct storage types.

## 0.12.1

### Patch Changes

- 9a53831: Fix crash when `currentValue` is not a string (e.g. boolean from config storage)

## 0.12.0

### Minor Changes

- 9659754: Add subOptions support and showHints option to FuzzyMultiSelector

## 0.11.2

### Patch Changes

- b5d63f7: fix: add non-null assertion for noUncheckedIndexedAccess compat

## 0.11.1

### Patch Changes

- 39f7085: fix: resolve type error in activeTabId assignment

## 0.11.0

### Minor Changes

- ef47f9c: Add small-list mode to `FuzzySelector` via `searchThreshold` (default `7`). When item count is at or below the threshold, it now renders a simple Up/Down/Enter list without a search input while keeping callbacks and `currentValue` pre-selection behavior consistent.

## 0.10.3

### Patch Changes

- c867cd2: Relax Pi peer dependency range to support current and future Pi versions without strict pinning.

## 0.10.2

### Patch Changes

- 221455d: Update Pi peer and development dependencies to 0.61.0.

## 0.10.1

### Patch Changes

- 5e1c968: fix: let nested settings submenus receive Ctrl+S before top-level save

  - when a submenu is open inside `registerSettingsCommand`, top-level settings no longer intercept `Ctrl+S`
  - this lets nested wizard-style submenus handle their own submit flow, such as the add-policy flow in `pi-guardrails`

## 0.10.0

### Minor Changes

- 494cebe: fix: local scope no longer resolves to ~/.pi, creates .pi/extensions/ in cwd when missing

  - `findLocalConfigPath` now stops before $HOME so `~/.pi` is never matched as project-local
  - `save("local")` falls back to `{cwd}/.pi/extensions/{name}.json` when no `.pi` dir exists in the tree

## 0.9.0

### Minor Changes

- 1006f56: Add JSON Schema support: `buildSchemaUrl` helper and `schemaUrl` option for ConfigLoader. When set, `save()` injects `$schema` as the first key and `load()` strips it from parsed config.

## 0.8.0

### Minor Changes

- b404f50: Add optional `extraTabs` support to `registerSettingsCommand` so extensions can render non-scope top-level tabs (for example, an `Examples` tab) after scope tabs.

  - Add `ExtraSettingsTab` and `ExtraSettingsTabContext` types and export them from package root.
  - Keep existing scope-tab `buildSections` and save semantics unchanged.
  - Make tab switching cycle across scope + extra tabs.
  - Validate tab id collisions with reserved scope ids.
  - Update README and skill/reference docs with `extraTabs` examples.

- 29a909d: Add Wizard-safe settings theme support by introducing a combined `SettingsTheme` that works as both `SettingsListTheme` and full pi `Theme`.

  - Add and export `SettingsTheme` (`SettingsListTheme & Theme`).
  - Add and export `getSettingsTheme(theme)` helper to build a combined theme object.
  - Extend `registerSettingsCommand` `buildSections` ctx with `theme: SettingsTheme`.
  - Extend `ExtraSettingsTabContext` with `theme: SettingsTheme`.
  - Keep existing `getSettingsListTheme()` consumers and existing callbacks backward-compatible.
  - Update README and example reference to show `ctx.theme` usage for both settings list and full Theme methods.

## 0.6.0

### Minor Changes

- 8f1e5a9: Add `FuzzyMultiSelector` (with `FuzzyMultiSelectorItem` and `FuzzyMultiSelectorOptions`) to support fuzzy-searchable multi-select workflows in extension UIs.

## 0.5.1

### Patch Changes

- 2f5ec32: mark pi SDK peer deps as optional to prevent koffi OOM in Gondolin VMs

## 0.5.0

### Minor Changes

- e4dc2d8: Add Wizard component with tabbed steps, borders, and progress tracking. Add DynamicBorder component for settings UI. Add goNext/goPrev to WizardStepContext. Fix FuzzySelector Enter handling. Add pi-utils-settings skill and reference extension.

## 0.4.0

### Minor Changes

- 7df01a2: Pass `ExtensionCommandContext` to `onSave` callback in settings command options

## 0.3.0

### Minor Changes

- 756552a: Add FuzzySelector component for picking one item from a large list using fuzzy search. Refresh sections after cycling value changes so dependent settings update immediately.

## 0.2.1

### Patch Changes

- b79b592: Fix search filter to match on section labels, not just item labels. When a section label matches the query, all items in that section are shown.

## 0.2.0

### Minor Changes

- 06e7e0c: Add flexible scope system with memory support

  - Add `Scope` type (`global`, `local`, `memory`)
  - Add `scopes` constructor option to ConfigLoader (default: `["global", "local"]`)
  - Walk up directory tree to find `.pi` for local config
  - Memory scope: ephemeral, not persisted, resets on reload
  - Dynamic tabs in settings command based on enabled scopes
  - Add `isInherited()` helper for memory tab display
  - Add `hasScope()`, `getEnabledScopes()` to ConfigStore interface

## 0.1.0

### Minor Changes

- 6432484: Initial release: ConfigLoader with migrations and afterMerge hook, registerSettingsCommand with Local/Global tabs and draft-based Ctrl+S save, SectionedSettings, ArrayEditor, and helpers.
