# @aliou/pi-utils-settings

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
