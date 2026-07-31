# JSON Schema for Settings Files

Extensions can ship a JSON Schema so that editors (VS Code, etc.) provide autocomplete and validation for settings files. The schema is generated from the `TConfig` TypeScript interface with the `pi-settings-schema` CLI, which wraps `ts-json-schema-generator` and injects the reserved `$schema` and `version` properties.

## 1. Add JSDoc comments to config types

JSDoc comments on `TConfig` fields become `description` in the generated schema. Always document every field. Do not declare `$schema` or `version` on the type — the CLI injects them.

```typescript
/** User-facing configuration. */
export interface MyConfig {
  /** Enable the extension. */
  enabled?: boolean;
  /** Comma-separated list of tags. */
  tags?: string[];
}
```

## 2. Generate the schema

Add `ts-json-schema-generator` as a devDep and add scripts to `package.json`:

```json
{
  "scripts": {
    "gen:schema": "pi-settings-schema -p src/config.ts -t MyConfig -o schema.json --version 2",
    "check:schema": "pi-settings-schema -p src/config.ts -t MyConfig -o schema.json --version 2 --check"
  }
}
```

- `-t/--type` must match the exported user-facing config interface name (the partial one, not the resolved one).
- `--version` documents the current migration version in the `version` property description. Bump it when you add a migration.
- `--check` regenerates to a temp file, diffs against the committed schema, and exits 1 on drift.
- Type checking is skipped by default (`--no-skip-type-check` to enable); config files may import packages that don't resolve in the generator's standalone typecheck context.

Run `pnpm gen:schema` to produce `schema.json`. Commit it. Add `"schema.json"` to the `files` array in `package.json` so it ships with the npm package.

Exclude `schema.json` from biome in `biome.json` to avoid drift between the generator output and the committed file. Biome v2 uses negated patterns in `includes`:

```json
{
  "files": {
    "includes": ["**/*.ts", "**/*.json", "!schema.json"]
  }
}
```

## 3. Wire up `buildSchemaUrl` in ConfigLoader

```typescript
import { ConfigLoader, buildSchemaUrl } from "@aliou/pi-utils-settings";
import pkg from "../package.json" with { type: "json" };

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

// If the schema is hosted outside npm/unpkg, provide a custom template:
const githubSchemaUrl = buildSchemaUrl("aliou/my-extension", "v1.0.0", {
  template: "https://raw.githubusercontent.com/{packageName}/{version}/{schemaPath}",
});

export const configLoader = new ConfigLoader<MyConfig, ResolvedConfig>(
  "my-extension",
  defaults,
  { schemaUrl },
);
```

When `schemaUrl` is set, `save()` writes `$schema` as the first key in the JSON file. `load()` strips it before returning config to callers. The config types stay clean. `buildSchemaUrl` defaults to unpkg, but supports `baseUrl` for npm-compatible hosts and `template` for GitHub raw URLs or other public hosts.

## 4. Add `check:schema` to CI

Add a step to `ci.yml` that verifies the committed schema matches the current types. This catches cases where someone updates the config type but forgets to regenerate.

```yaml
- name: Check schema is up to date
  run: pnpm check:schema
```

The full CI job should run lint, typecheck, and check:schema. No changes needed in the publish workflow since `schema.json` is already in `files` and ships with the package.

## Programmatic use

The same logic is exported from the package:

```typescript
import { finalizeSchema, generateSettingsSchema } from "@aliou/pi-utils-settings";

// Full pipeline (requires ts-json-schema-generator installed):
await generateSettingsSchema({
  path: "src/config.ts",
  type: "MyConfig",
  out: "schema.json",
  version: 2,
  check: false,
});

// Just inject reserved keys into an existing schema object:
finalizeSchema(schema, { version: 2 });
```

## Testing schema generation

To verify generation works on the reference example bundled in this package:

```bash
npx pi-settings-schema \
  -p skills/pi-utils-settings/references/example-extension/config.ts \
  -t ExampleConfig \
  -o skills/pi-utils-settings/references/example-extension/schema.json
```

To verify the committed schema hasn't drifted:

```bash
npx pi-settings-schema \
  -p skills/pi-utils-settings/references/example-extension/config.ts \
  -t ExampleConfig \
  -o skills/pi-utils-settings/references/example-extension/schema.json \
  --check
```

## Reference implementation

The extension template at `../pi-extension-template/` is a working example with all pieces wired up:

- `src/config.ts` — JSDoc on `ExtensionTemplateConfig`, `buildSchemaUrl` from `package.json`, `schemaUrl` passed to `ConfigLoader`
- `schema.json` — generated and committed
- `package.json` — `gen:schema` + `check:schema` scripts, `ts-json-schema-generator` devDep, `schema.json` in `files`
- `biome.json` — `schema.json` excluded from checks
- `.github/workflows/ci.yml` — `check:schema` step after typecheck

The bundled example extension at `references/example-extension/` also includes a generated `schema.json` with full JSDoc descriptions.
