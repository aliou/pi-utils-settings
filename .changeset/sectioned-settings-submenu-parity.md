---
"@aliou/pi-utils-settings": minor
---

`SectionedSettings` submenu parity with pi-tui's `SettingsList`, wider pi peer range

- `SectionedSettingItem.submenu`'s `done` callback now accepts an optional `SubmenuDoneOptions` object (`{ navigateTo?: string }`). Calling `done(value, { navigateTo: itemId })` closes the submenu, selects the target item, and auto-activates it (opens its submenu, cycles a `values` item, or selects a plain item), matching pi-tui's `SettingsList`. Close behavior without options is unchanged.
- `SectionedSettings` gains `selectItem(id: string)`, which moves the cursor to the item with the given id (no-op if not found).
- The optional `@earendil-works/pi-coding-agent` peer dependency range widens from `>=0.74.0 <1` to `>=0.74.0 <2` so newly released pi versions no longer trigger a peer-dependency warning.
