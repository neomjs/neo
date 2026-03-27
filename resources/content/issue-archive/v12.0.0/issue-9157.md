---
id: 9157
title: 'perf(grid): Optimize Horizontal Scrolling (Cell Recycling)'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-14T23:53:07Z'
updatedAt: '2026-02-15T00:29:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9157'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T00:29:52Z'
---
# perf(grid): Optimize Horizontal Scrolling (Cell Recycling)

Currently, horizontal scrolling in the Grid forces a full re-render of all visible cells (`createViewData(force=true)`).
This is because `Neo.grid.Body` detects a change in `mountedColumns` and triggers a forced update for all rows.
This results in O(N*M) operations (N rows * M columns) even for a 1-column scroll delta.

**Optimization Goal:**
Implement "Cell Recycling" or efficient DOM updates for horizontal scrolling, similar to how Row Pooling works for vertical scrolling.
Only the cells entering/leaving the viewport (or updating content) should be re-rendered.

**Tasks:**
1.  Analyze `Neo.grid.Row.createVdom` to see if we can selectively update cells instead of rebuilding the entire `cn` array.
2.  Investigate if we can detect the *direction* of the scroll and only update the leading/trailing edges of the pooled cells.
3.  Ensure `component` based columns are properly recycled/moved.

## Timeline

- 2026-02-14T23:53:08Z @tobiu added the `enhancement` label
- 2026-02-14T23:53:08Z @tobiu added the `ai` label
- 2026-02-14T23:53:09Z @tobiu added the `performance` label
- 2026-02-15T00:28:46Z @tobiu referenced in commit `303cc88` - "perf(grid): Optimize Horizontal Scrolling with Cell Recycling (#9157)"
- 2026-02-15T00:28:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T00:29:02Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Cell Recycling" optimization for horizontal scrolling.
> 
> **Changes:**
> 1.  **Map-Based Recycling:** `Neo.grid.Row` now captures the previous VDOM children (`oldCn`) and creates a `Map` keyed by `dataField`. This allows robust O(1) lookup of reusable cells regardless of their pool index or position.
> 2.  **Smart Recycling Logic:** Inside the `createVdom` loop, we check if a valid cell VDOM exists for the current column and record ID. If so, we:
>     -   Update its `id` to match the new pool slot.
>     -   Update its position (`left`, `width`) and `aria-colindex`.
>     -   Reuse the VDOM node directly, skipping the expensive `applyRendererOutput` call (and thus preventing unnecessary Component re-renders).
> 3.  **Body Integration:** `Neo.grid.Body` now correctly passes the `recycle` flag to rows when implicit horizontal scrolling is detected.
> 
> **Verified Impact:**
> Horizontal scrolling now only triggers renderers for newly entering columns, significantly reducing the overhead from ~975+ calls to ~140 (proportional to new columns * rows) in test scenarios.
> 
> This completes the performance optimization epic.

- 2026-02-15T00:29:52Z @tobiu closed this issue
- 2026-02-15T00:32:29Z @tobiu cross-referenced by #9158

