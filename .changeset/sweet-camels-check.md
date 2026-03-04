---
"@aliou/pi-utils-settings": minor
---

Add Wizard-safe settings theme support by introducing a combined `SettingsTheme` that works as both `SettingsListTheme` and full pi `Theme`.

- Add and export `SettingsTheme` (`SettingsListTheme & Theme`).
- Add and export `getSettingsTheme(theme)` helper to build a combined theme object.
- Extend `registerSettingsCommand` `buildSections` ctx with `theme: SettingsTheme`.
- Extend `ExtraSettingsTabContext` with `theme: SettingsTheme`.
- Keep existing `getSettingsListTheme()` consumers and existing callbacks backward-compatible.
- Update README and example reference to show `ctx.theme` usage for both settings list and full Theme methods.
