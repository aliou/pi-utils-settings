---
"@aliou/pi-utils-settings": minor
---

Add a `minContentHeight` option to `SectionedSettings`: when the rendered body is shorter than the given number of lines, it is padded with blank lines so the panel height stays stable across tabs and cursor moves (same behavior as the Wizard option of the same name). `registerSettingsCommand` now passes a fixed `minContentHeight` of 20 (search input + blank, up to 15 visible item lines, scroll indicator, description block), so the settings panel no longer jumps in height when switching tabs.
