---
name: pi-utils-settings
description: Guide for using @aliou/pi-utils-settings to add persistent settings to pi extensions. Use when implementing config loading, settings UI, migrations, scopes, or TUI components (ArrayEditor, PathArrayEditor, SectionedSettings) for a pi extension.
---

# pi-utils-settings

Shared settings infrastructure for pi extensions. Provides JSON config with scoped persistence, draft-based settings UI, and reusable TUI components.

## Quick Start

### 1. Define config types

Two types: a partial user-facing schema and a fully-resolved internal schema.

```typescript
// config.ts
import { ConfigLoader } from "@aliou/pi-utils-settings";

// User-facing: all fields optional (stored on disk)
interface MyConfig {
  features?: { darkMode?: boolean };
  tags?: string[];
}

// Internal: all fields required (defaults applied)
interface ResolvedConfig {
  features: { darkMode: boolean };
  tags: string[];
}

const defaults: ResolvedConfig = {
  features: { darkMode: false },
  tags: [],
};

export const configLoader = new ConfigLoader<MyConfig, ResolvedConfig>(
  "my-extension", // file name: ~/.pi/agent/extensions/my-extension.json (global)
  defaults,       //            .pi/extensions/my-extension.json (local)
);

// In extension activate():
await configLoader.load();
const config = configLoader.getConfig(); // ResolvedConfig
```

### 2. Register settings command

```typescript
import { registerSettingsCommand } from "@aliou/pi-utils-settings";

registerSettingsCommand<MyConfig, ResolvedConfig>(pi, {
  commandName: "my-ext:settings",
  title: "My Extension Settings",
  configStore: configLoader,
  buildSections: (tabConfig, resolved) => [
    {
      label: "General",
      items: [
        {
          id: "features.darkMode",
          label: "Dark mode",
          description: "Enable dark theme",
          currentValue: (tabConfig?.features?.darkMode ?? resolved.features.darkMode) ? "on" : "off",
          values: ["on", "off"],
        },
      ],
    },
  ],
  // Required for non-string config values. The default handler stores
  // raw strings ("on"/"off"), but booleans need explicit conversion.
  // Return null for unhandled IDs.
  onSettingChange: (id, newValue, config) => {
    const updated = structuredClone(config);
    if (id === "features.darkMode") {
      updated.features ??= {};
      updated.features.darkMode = newValue === "on";
      return updated;
    }
    return null;
  },
});
```

The `buildSections` callback receives a third `ctx` argument:

```typescript
buildSections: (tabConfig, resolved, ctx) => { ... }
// ctx.setDraft(config)          — store a draft for the active scope
// ctx.scope                     — current scope ("global" | "local" | "memory")
// ctx.isInherited(path)         — true if the dotted path has no value in the current scope
// ctx.theme                     — SettingsTheme (works as both SettingsListTheme and full Theme)
```

### Extra top-level tabs (non-scope)

Use `extraTabs` when you need tabs like `Examples`, `Help`, or `Presets` that are not tied to a specific scope.

```typescript
import { registerSettingsCommand, type ExtraSettingsTab } from "@aliou/pi-utils-settings";

const extraTabs: ExtraSettingsTab<MyConfig, ResolvedConfig>[] = [
  {
    id: "examples",
    label: "Examples",
    // buildSections context: { resolved, setDraftForScope, getDraftForScope,
    //   getRawForScope, enabledScopes, theme }
    buildSections: ({ resolved, enabledScopes, getRawForScope }) => [
      {
        label: "Info",
        items: [
          {
            id: "examples.scopes",
            label: "Enabled scopes",
            currentValue: enabledScopes.join(", "),
          },
          {
            id: "examples.theme",
            label: "Dark mode",
            currentValue: resolved.features.darkMode ? "on" : "off",
          },
          {
            id: "examples.global",
            label: "Global config",
            currentValue: getRawForScope("global") ? "present" : "missing",
          },
        ],
      },
    ],
  },
];

registerSettingsCommand<MyConfig, ResolvedConfig>(pi, {
  commandName: "my-ext:settings",
  title: "My Extension Settings",
  configStore: configLoader,
  extraTabs,
  buildSections: (tabConfig, resolved, ctx) => {
    // scope-tab builder (unchanged)
    return [];
  },
});
```

`Ctrl+S` semantics stay the same: only dirty scope drafts are saved. Extra tabs can still mutate scope drafts via `setDraftForScope(...)` (typically from submenu callbacks).

## Scopes

ConfigLoader supports three scopes, merged lowest-to-highest priority:

| Scope    | Path                                         | Persisted |
|----------|----------------------------------------------|-----------|
| `global` | `~/.pi/agent/extensions/{name}.json`         | Yes       |
| `local`  | `{project}/.pi/extensions/{name}.json`       | Yes       |
| `memory` | In-memory only                               | No        |

Default: `["global", "local"]`. Configure via `scopes` option:

```typescript
new ConfigLoader("my-ext", defaults, {
  scopes: ["global", "memory"], // no local scope
});
```

The settings UI shows one tab per enabled scope. You can also add non-scope top-level tabs with `extraTabs`. Tab/Shift+Tab switches across all tabs.

## Adding Settings Items

Each item needs `id`, `label`, and `currentValue`. For interaction, provide either:

- `values`: Array of allowed string values (cycles on Enter/Space) — for toggles and enums
- `submenu`: Factory `(currentValue, done) => Component` — for complex editors (arrays, objects, fuzzy selectors)

`description` is optional and shown below the list when the item is selected.

The default change handler stores all values as raw strings (e.g., `"on"/"off"`, `"pnpm"`). Use `onSettingChange` to convert display values to the correct storage types (booleans, numbers, etc.). Return the updated config, or `null` for unhandled IDs:

```typescript
onSettingChange: (id, newValue, config) => {
  const updated = structuredClone(config);
  if (id === "refreshInterval") {
    updated.refreshInterval = parseInt(newValue, 10);
    return updated;
  }
  return null;
},
```

### Submenu Items

For arrays or complex values, use `submenu` instead of `values`. Inside `buildSections`, use `ctx.theme` (a `SettingsTheme` that works as both `SettingsListTheme` and full `Theme`). The submenu factory also receives a `{ requestRender }` context so async submenus can request a redraw once data is ready:

```typescript
import { ArrayEditor, PathArrayEditor } from "@aliou/pi-utils-settings";

// Inside buildSections(tabConfig, resolved, ctx):
const current = tabConfig ?? ({} as MyConfig);
const tags = current.tags ?? resolved.tags;

// ... in items array:
{
  id: "tags",
  label: "Tags",
  currentValue: `${tags.length} items`,
  submenu: (_val, done, _ctx) =>
    new ArrayEditor({
      label: "Tags",
      items: [...tags],
      theme: ctx.theme,
      onSave: (items) => {
        ctx.setDraft({ ...current, tags: items });
        done(`${items.length} items`);
      },
      onDone: () => done(undefined), // undefined = no change
    }),
}
```

`PathArrayEditor` is identical but adds Tab completion for filesystem paths. Accepts optional `validatePath` hook.

For submenus that need to fetch remote data before showing the real editor, return a small wrapper that loads in the background and calls `requestRender()` when ready:

```typescript
import type { Component } from "@earendil-works/pi-tui";
import { FuzzySelector } from "@aliou/pi-utils-settings";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadRemoteThemes(): Promise<string[]> {
  // Replace with a real fetch or subprocess call.
  await sleep(2000);
  return ["dark", "light", "solarized-dark", "nord"];
}

// ... in items array:
{
  id: "appearance.remoteTheme",
  label: "Remote theme",
  currentValue: theme,
  submenu: (_val, done, { requestRender }) => {
    class AsyncThemePicker implements Component {
      private editor: Component | null = null;

      constructor() {
        void loadRemoteThemes().then((themes) => {
          this.editor = new FuzzySelector({
            label: "Remote Theme",
            items: themes,
            currentValue: theme,
            theme: ctx.theme,
            onSelect: (selected) => {
              const updated: MyConfig = {
                ...current,
                appearance: { ...current.appearance, theme: selected },
              };
              ctx.setDraft(updated);
              done(selected);
            },
            onDone: () => done(undefined),
          });
          requestRender();
        });
      }

      render(width: number): string[] {
        return this.editor?.render(width) ?? [ctx.theme.hint("  (loading remote themes...)")];
      }

      handleInput(data: string): void {
        this.editor?.handleInput?.(data);
      }

      invalidate(): void {
        this.editor?.invalidate?.();
      }
    }

    return new AsyncThemePicker();
  },
}
```

When building components outside `registerSettingsCommand` (e.g., inside `ctx.ui.custom`), use `getSettingsTheme(theme)` to create a combined theme:

```typescript
import { getSettingsTheme } from "@aliou/pi-utils-settings";

// Inside ctx.ui.custom((_tui, uiTheme, _kb, done) => { ... })
const settingsTheme = getSettingsTheme(uiTheme);
```

## Migrations

Transform config on load. Applied in order; if any run, the result is saved back to disk.

```typescript
import { type Migration } from "@aliou/pi-utils-settings";

const migrations: Migration<MyConfig>[] = [
  {
    name: "rename-field",
    shouldRun: (config) => "oldField" in config,
    run: (config, _filePath) => {
      const { oldField, ...rest } = config as any;
      return { ...rest, newField: oldField };
    },
  },
];

new ConfigLoader("my-ext", defaults, { migrations });
```

### Migration messages

Migrations can declare an optional `message` that is queued when the migration runs successfully. Extensions drain these messages and display them to the user (e.g. via `ctx.ui.notify` in `session_start`).

```typescript
// Static message — always shown when the migration runs
{
  name: "remove-legacy-field",
  shouldRun: (c) => "legacyField" in c,
  message: "[my-ext] legacyField has been removed from config.",
  run: (c) => { const { legacyField, ...rest } = c as any; return rest; },
}

// Dynamic message — function receives before and after config
{
  name: "rename-toolchain",
  shouldRun: (c) => c.packageManager !== undefined,
  message: (before, after) =>
    `packageManager renamed to toolchain (was ${before.packageManager}, now ${after.toolchain})`,
  run: (c) => { const { packageManager, ...rest } = c as any; return { ...rest, toolchain: packageManager }; },
}

// Conditional message — return undefined to skip
{
  name: "strip-deprecated",
  shouldRun: (c) => "deprecatedField" in c,
  message: (before) =>
    (before as any).deprecatedField !== undefined
      ? "deprecatedField has been removed."
      : undefined,
  run: (c) => { const { deprecatedField, ...rest } = c as any; return rest; },
}
```

Display pending messages in your extension's `session_start` hook:

```typescript
pi.on("session_start", (_event, ctx) => {
  for (const message of configLoader.drainMessages()) {
    ctx.ui.notify(message, "warning");
  }
});
```

Messages are only queued when the migration succeeds. Failed migrations do not produce messages, and message factory errors are caught gracefully (logged to console, not queued).

## afterMerge Hook

For post-merge logic that cannot be expressed as a simple deep merge:

```typescript
new ConfigLoader("my-ext", defaults, {
  afterMerge: (resolved, global, local, memory) => {
    if (local?.overrideAll) {
      resolved.features = local.overrideAll;
    }
    return resolved;
  },
});
```

## registerSettingsCommand Options

```typescript
registerSettingsCommand(pi, {
  commandName,             // e.g. "my-ext:settings"
  commandDescription,     // optional: command palette text
  title,                  // header shown in the settings UI
  configStore,            // ConfigLoader or custom ConfigStore
  buildSections,          // (tabConfig, resolved, ctx) => SettingsSection[]
  extraTabs,              // optional: non-scope tabs (e.g. Examples, Help)
  onSettingChange,        // convert display strings to typed config values
  onBeforeClose,          // (isDirty) => boolean; return false to prevent closing
  onSave,                 // (ctx) => void; called after Ctrl+S saves; use to reload runtime
});
```

- `onSave(ctx)` is called after a successful save. Use it to reload runtime state.
- `onBeforeClose(isDirty)` lets you prevent closing with unsaved drafts (return `false` to keep open).

## ConfigStore Interface

Extensions with custom storage can implement `ConfigStore` directly instead of using `ConfigLoader`. `Scope` is exported as `"global" | "local" | "memory"`.

```typescript
import type { Scope, ConfigStore } from "@aliou/pi-utils-settings";

interface ConfigStore<TConfig, TResolved> {
  getConfig(): TResolved;
  getRawConfig(scope: Scope): TConfig | null;
  hasScope(scope: Scope): boolean;
  hasConfig(scope: Scope): boolean;
  getEnabledScopes(): Scope[];
  save(scope: Scope, config: TConfig): Promise<void>;
}
```

## Helpers

```typescript
import { setNestedValue, getNestedValue } from "@aliou/pi-utils-settings";

setNestedValue(obj, "a.b.c", true);    // obj.a.b.c = true (creates intermediates)
getNestedValue(obj, "a.b.c");          // returns obj.a.b.c or undefined
```

## Setup Commands (Wizard Component)

For first-time configuration or multi-step onboarding, use the `Wizard` component. It renders all steps as tabs inside a bordered frame with navigation, progress indicators, and a shared state model.

```typescript
import { Wizard, type WizardStepContext } from "@aliou/pi-utils-settings";

pi.registerCommand("my-ext:setup", {
  description: "First-time setup wizard",
  handler: async (_args, ctx) => {
    // Shared mutable state that each step writes into
    const state = { url: "", name: "" };

    const saved = await ctx.ui.custom<boolean>((_tui, uiTheme, _kb, done) => {
      return new Wizard({
        title: "My Extension Setup",
        theme: uiTheme,
        onComplete: () => done(true),
        onCancel: () => done(false),
        steps: [
          {
            label: "URL",
            build: (wizardCtx) => new UrlStep(state, wizardCtx),
          },
          {
            label: "Name",
            build: (wizardCtx) => new NameStep(state, wizardCtx),
          },
        ],
      });
    });

    if (!saved) return;
    await configLoader.save("global", state);
    ctx.ui.notify("Setup complete", "info");
  },
});
```

Each step is a `Component` that receives a `WizardStepContext`:
- `markComplete()` / `markIncomplete()` — fill or clear the step's progress dot (●/○)
- `goNext()` — advance to the next step
- `goPrev()` — go back to the previous step

The Wizard handles borders, tab rendering, and global navigation (Tab/Shift+Tab between steps, Ctrl+S to submit, Esc to cancel). Step components should NOT handle Esc or Tab. Steps should call `goNext()` after the user completes them (e.g. after Enter selects a value).

Steps write into shared mutable state. After `onComplete` fires, read the state and save.

Wizard options: `title`, `steps`, `theme`, `onComplete`, `onCancel`, `minContentHeight` (minimum lines for the step area), `hintSuffix` (extra hint text).

## Components

This package includes TUI components for use in settings UIs and setup wizards. All are exported from `@aliou/pi-utils-settings`.

| Component            | Use case                                       |
|----------------------|------------------------------------------------|
| `Wizard`             | Multi-step setup with tabbed navigation + borders |
| `SectionedSettings`  | Grouped settings list with search and submenus |
| `SettingsDetailEditor` | Focused second-level editor for one selected item |
| `ArrayEditor`        | Edit a `string[]` (add/edit/delete)            |
| `PathArrayEditor`    | Same as ArrayEditor + Tab path completion      |
| `FuzzySelector`      | Fuzzy-searchable single-select list            |
| `FuzzyMultiSelector` | Fuzzy-searchable multi-select checklist with locked/recommended items and sub-options |

These components implement the pi-tui `Component` interface (`render`, `handleInput`, `invalidate`). They are designed for use inside `registerSettingsCommand` submenus or `ctx.ui.custom` calls.

Note: `packages/ui/` is a separate package with different primitives (panels, tool renderers). There is no overlap.

## Save Model

All changes are held as in-memory drafts until Ctrl+S. Esc exits without saving. Dirty tabs show a `*` marker. After save, `onSave` callback fires (use to reload runtime state).

## JSON Schema for Settings Files

Extensions can ship a JSON Schema so editors provide autocomplete and validation for settings files. The schema is auto-generated from the `TConfig` interface via `ts-json-schema-generator`, and `ConfigLoader` injects a `$schema` field into saved files.

See `references/json-schema.md` (relative to this skill directory) for the full setup guide: JSDoc conventions, `gen:schema`/`check:schema` scripts, `buildSchemaUrl` wiring, CI integration, and testing commands.

## Pi Extension Wiring

`pi` is the `ExtensionAPI` passed to your extension's `activate` function:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function activate(pi: ExtensionAPI) {
  await configLoader.load();
  registerSettingsCommand(pi, { /* ... */ });
}
```

For Wizard commands, the handler receives a `ctx` with `ctx.ui.custom` for custom UI rendering. Check `ctx.hasUI` before using it:

```typescript
pi.registerCommand("my-ext:setup", {
  description: "First-time setup wizard",
  handler: async (_args, ctx) => {
    if (!ctx.hasUI) return;
    const result = await ctx.ui.custom((_tui, uiTheme, _kb, done) => {
      return new Wizard({ /* ... */ });
    });
  },
});
```

## Full Pattern

Typical extension file structure:

```
my-extension/
  index.ts       # activate() calls configLoader.load(), registers commands
  config.ts      # ConfigLoader + types + migrations + buildSchemaUrl
  schema.json    # auto-generated JSON Schema (committed, hosted publicly)
  commands/
    settings.ts  # registerSettingsCommand (edit existing config)
    setup.ts     # optional: multi-step wizard for first-time config
```

A complete reference extension is bundled at `references/example-extension/` (relative to this skill directory). It demonstrates every feature: config types, migrations, afterMerge, settings command with scope tabs plus an extra non-scope tab, all item types (toggles, enums, submenus with ArrayEditor/PathArrayEditor/FuzzySelector), setup wizard using the Wizard component with tabbed steps, and the activation pattern.
