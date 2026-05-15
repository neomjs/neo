---
id: 8120
title: 'Regression: SortZone calculates item layout after placeholder insertion, causing incorrect positioning'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2025-12-16T10:58:45Z'
updatedAt: '2025-12-16T11:10:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8120'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T11:10:54Z'
---
# Regression: SortZone calculates item layout after placeholder insertion, causing incorrect positioning

When dragging items in a `SortZone` where items have margins (e.g., `&:not(:first-child) { margin-left: 20px; }`), the layout calculations (`getDomRect`) were previously occurring *after* `dragStart`.

`dragStart` inserts a `dragPlaceholder` which modifies the DOM structure. If this placeholder doesn't perfectly mimic the original item's margins immediately, the remaining siblings shift positions (e.g. collapsing the gap).
Since `getDomRect` was called after this shift, the captured `itemRects` were incorrect (missing the gaps), causing items to overlap when absolute positioning was applied.

**Fix:**
The `onDragStart` logic in `src/draggable/container/SortZone.mjs` has been reordered to:
1. Measure the DOM (`getDomRect`) and capture `itemStyles` *before* calling `dragStart`.
2. This ensures the layout is captured exactly as rendered, with all margins and gaps intact.
3. Apply these correct coordinates after the drag operation has started.

## Timeline

- 2025-12-16T10:58:46Z @tobiu added the `bug` label
- 2025-12-16T10:58:46Z @tobiu added the `ai` label
- 2025-12-16T10:58:46Z @tobiu added the `regression` label
- 2025-12-16T10:59:01Z @tobiu assigned to @tobiu
- 2025-12-16T11:09:38Z @tobiu changed title from **Regression: SortZone dragPlaceholder missing margins causing layout shift** to **Regression: SortZone calculates item layout after placeholder insertion, causing incorrect positioning**
- 2025-12-16T11:10:54Z @tobiu closed this issue

