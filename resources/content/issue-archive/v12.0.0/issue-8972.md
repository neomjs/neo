---
id: 8972
title: 'refactor: Switch Grid Row to explicit updateContent pattern (#8964)'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-03T21:12:07Z'
updatedAt: '2026-02-03T21:14:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8972'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T21:14:23Z'
---
# refactor: Switch Grid Row to explicit updateContent pattern (#8964)

The current reactivity model for `Neo.grid.Row` using `record_` and `rowIndex_` reactive configs has proven brittle and prone to race conditions, update loops, and stale data (e.g., columns disappearing after scrolling).

**Proposed Architecture:**
1.  **Remove Reactivity:** Convert `record_` and `rowIndex_` to standard non-reactive configs in `Neo.grid.Row`.
2.  **Explicit Update Method:** Introduce `updateContent({record, rowIndex})` in `Neo.grid.Row`.
    *   This method will synchronously update the instance properties.
    *   It will then explicitly trigger `createVdom()`.
3.  **Refactor GridBody:**
    *   Update `createViewData` to call `row.updateContent()` directly for every row in the view window.
    *   Remove the `force` parameter logic as `updateContent` will always force a VDOM generation.
    *   This simplifies the update logic and ensures determinism.

**Tasks:**
1.  **Refactor `src/grid/Row.mjs`:**
    *   Change `record_` to `record`.
    *   Change `rowIndex_` to `rowIndex`.
    *   Remove `afterSetRecord`.
    *   Implement `updateContent(data)`.
2.  **Refactor `src/grid/Body.mjs`:**
    *   Update `createViewData` to use `item.updateContent({record, rowIndex})`.
    *   Remove `force` parameter usage.

## Timeline

- 2026-02-03T21:12:13Z @tobiu added the `ai` label
- 2026-02-03T21:12:13Z @tobiu added the `refactoring` label
- 2026-02-03T21:12:41Z @tobiu assigned to @tobiu
- 2026-02-03T21:14:06Z @tobiu referenced in commit `f98df52` - "refactor: Switch Grid Row to explicit updateContent pattern (#8972)"
### @tobiu - 2026-02-03T21:14:10Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the Grid Row architecture to use an explicit `updateContent` pattern.
> - Converted `record` and `rowIndex` to non-reactive configs.
> - Implemented `Row.updateContent` for synchronous state updates and VDOM generation.
> - Updated `GridBody.createViewData` to unconditionally update all visible rows using this new method.
> 
> This removes the brittleness of the reactive config system for this high-performance use case and ensures that rows always reflect the latest state, solving the issue with empty columns after scrolling.

- 2026-02-03T21:14:23Z @tobiu closed this issue

