---
"@aliou/pi-utils-settings": minor
---

fix: local scope no longer resolves to ~/.pi, creates .pi/extensions/ in cwd when missing

- `findLocalConfigPath` now stops before $HOME so `~/.pi` is never matched as project-local
- `save("local")` falls back to `{cwd}/.pi/extensions/{name}.json` when no `.pi` dir exists in the tree
