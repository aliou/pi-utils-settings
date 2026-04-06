---
"@aliou/pi-utils-settings": minor
---

Remove `displayToStorageValue` helper. The default change handler now stores raw strings as-is instead of coercing "on"/"off"/"enabled"/"disabled" to booleans. Use `onSettingChange` to convert display values to the correct storage types.
