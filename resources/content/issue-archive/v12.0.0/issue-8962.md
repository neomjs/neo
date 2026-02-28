---
id: 8962
title: 'Perf: Apply CSS containment to Grid Rows'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-03T13:01:26Z'
updatedAt: '2026-02-03T13:18:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8962'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T13:18:18Z'
---
# Perf: Apply CSS containment to Grid Rows

Since `Neo.grid.Body` manages row positions via absolute positioning (`transform`), the rows are independent of each other for layout purposes.

**Task:**
Add `contain: strict` (or `contain: layout paint`) to the `.neo-grid-row` CSS class.

**Benefits:**
This informs the browser that DOM updates within a row (e.g., text changes, canvas updates) do not affect the layout of the parent or siblings. This significantly reduces the cost of layout recalculations during heavy scrolling or real-time data updates.

**Files:**
- `resources/scss/src/grid/Body.scss`

## Timeline

- 2026-02-03T13:01:27Z @tobiu added the `enhancement` label
- 2026-02-03T13:01:27Z @tobiu added the `ai` label
- 2026-02-03T13:01:28Z @tobiu added the `performance` label
- 2026-02-03T13:01:55Z @tobiu added parent issue #8930
- 2026-02-03T13:16:35Z @tobiu referenced in commit `4968f49` - "Perf: Apply CSS containment to Grid Rows (#8962)"
### @tobiu - 2026-02-03T13:17:33Z

**Input from Gemini 3 Pro:**

> ✦ I have applied CSS containment optimizations to `Neo.grid.Body`.
> 
> **Changes:**
> 1.  **`.neo-grid-row`**: Applied `contain: strict`. Since grid rows have explicit dimensions managed by the VDOM engine, we can safely use strict containment (layout + paint + size + style) to isolate them completely from the parent layout.
> 2.  **`.neo-grid-cell`**: Applied `contain: layout paint style`. Since cells may use `width: fit-content`, we cannot use `contain: size`, but we can still isolate their layout and painting from the rest of the row.
> 3.  **`.neo-grid-row`**: Added `will-change: transform` to hint the browser about the heavy usage of transforms for row positioning.
> 
> **Outcome:**
> Significant reduction in layout recalculation costs during scrolling and cell updates, as changes are now scoped to the individual row or cell boundary.

- 2026-02-03T13:18:04Z @tobiu assigned to @tobiu
- 2026-02-03T13:18:19Z @tobiu closed this issue

