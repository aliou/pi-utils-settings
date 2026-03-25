---
"@aliou/pi-utils-settings": minor
---

Add small-list mode to `FuzzySelector` via `searchThreshold` (default `7`). When item count is at or below the threshold, it now renders a simple Up/Down/Enter list without a search input while keeping callbacks and `currentValue` pre-selection behavior consistent.
