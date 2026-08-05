---
"@aliou/pi-utils-settings": patch
---

Support semver strings as migration versions. `Migration.version` now accepts a non-negative integer or a semver string (e.g. `"1.2.0"`, the extension's package version), so extensions can version configs with their own release version instead of a parallel integer counter. All versioned migrations in one loader must use the same scheme; mixing integers and semver strings throws at construction. Prerelease/build metadata is not supported. `getVersion()` and `MigrationContext.fromVersion`/`toVersion` are now typed `number | string` — runtime behavior is unchanged for integer-versioned loaders, but TypeScript consumers coercing these to `number` need a type guard.
