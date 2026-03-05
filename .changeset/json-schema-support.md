---
"@aliou/pi-utils-settings": minor
---

Add JSON Schema support: `buildSchemaUrl` helper and `schemaUrl` option for ConfigLoader. When set, `save()` injects `$schema` as the first key and `load()` strips it from parsed config.
