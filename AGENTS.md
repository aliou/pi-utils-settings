# pi-utils-settings

Public package with shared settings infrastructure for Pi extensions.

## Scope

- Config loading and migration (`ConfigLoader`)
- Reusable settings UIs (`registerSettingsCommand`, `SectionedSettings`, `SettingsDetailEditor`)
- Shared editors (`ArrayEditor`, `PathArrayEditor`, `FuzzySelector`, `Wizard`)

## Rules

- Preserve backwards compatibility for exported APIs when possible.
- Prefer additive changes over breaking changes.
- Keep examples/docs aligned with code in `README.md` and `skills/`.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Versioning

Uses changesets.

- `patch`: bug fixes, docs-only behavior clarifications
- `minor`: new components/options/callbacks, non-breaking API additions
- `major`: breaking API changes
