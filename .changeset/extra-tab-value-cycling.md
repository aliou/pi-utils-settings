---
"@aliou/pi-utils-settings": patch
---

Extra tabs can now handle value-cycling setting items with an explicit `onSettingChange` callback. The callback receives `applySettingChangeToScope(...)`, which reuses the command-level setting change handler and writes the result into the chosen scope draft so Ctrl+S persists it.

Also align `onSettingChange` behavior with the docs: returning `null` falls through to the default dotted-path string storage.
