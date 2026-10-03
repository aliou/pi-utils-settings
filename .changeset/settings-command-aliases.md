---
"@aliou/pi-utils-settings": minor
---

Add an `aliases` option to `registerSettingsCommand`: each alias registers a second command (e.g. `/my-ext:proxy`) that opens the same settings UI with a preselected tab (scope or extra tab), with registration-time validation for duplicate alias names and unknown tabs, and a default palette description of `Open ${title} (${tabLabel})`. The main command's args now preselect a tab (`/my-ext:settings proxy`, matched case-insensitively against tab ids then labels, unknown tokens warn and fall back to the default tab) and it registers `getArgumentCompletions` with one item per registered tab.
