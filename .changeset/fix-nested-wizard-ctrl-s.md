---
"@aliou/pi-utils-settings": patch
---

fix: let nested settings submenus receive Ctrl+S before top-level save

- when a submenu is open inside `registerSettingsCommand`, top-level settings no longer intercept `Ctrl+S`
- this lets nested wizard-style submenus handle their own submit flow, such as the add-policy flow in `pi-guardrails`
