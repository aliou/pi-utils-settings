---
"@aliou/pi-utils-settings": minor
---

Add optional `extraTabs` support to `registerSettingsCommand` so extensions can render non-scope top-level tabs (for example, an `Examples` tab) after scope tabs.

- Add `ExtraSettingsTab` and `ExtraSettingsTabContext` types and export them from package root.
- Keep existing scope-tab `buildSections` and save semantics unchanged.
- Make tab switching cycle across scope + extra tabs.
- Validate tab id collisions with reserved scope ids.
- Update README and skill/reference docs with `extraTabs` examples.
