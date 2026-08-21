---
"@aliou/pi-utils-settings": minor
---

Add a `contentHeight` option to `SectionedSettings`: the rendered body is held at exactly the given number of lines, so the panel height stays stable across tabs and cursor moves (same goal as the Wizard's `minContentHeight` option). `registerSettingsCommand` passes a `contentHeight` of 20 by default, so the settings panel no longer jumps in height when switching tabs. See the flex-content-height-layout changeset for the layout details.
