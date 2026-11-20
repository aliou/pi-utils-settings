---
"@aliou/pi-utils-settings": patch
---

Copy submenu render output in `SettingsDetailEditor` before padding it, so it no longer mutates the cached array returned by a submenu's `render()` (pi-tui ≥1.6.0).
