---
"@aliou/pi-utils-settings": minor
---

Submenu factories now receive a `{ requestRender: () => void }` context so async-loaded submenus can trigger a redraw.

- `SectionedSettings` submenu signature is `(currentValue, done, ctx) => Component`.
- `SettingsDetailEditor` nested submenu signature is `(done, ctx) => Component`.
- `registerSettingsCommand` wires the real `tui.requestRender()` hook automatically.
- Standalone `SectionedSettings` / `SettingsDetailEditor` users can pass `requestRender` in options.
- Existing 2-argument submenu factories remain compatible.
