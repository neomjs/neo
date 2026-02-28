---
id: 9156
title: 'perf(grid): Optimize VDOM generation in Row.updateContent'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-14T23:39:31Z'
updatedAt: '2026-02-14T23:52:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9156'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T23:52:44Z'
---
# perf(grid): Optimize VDOM generation in Row.updateContent

Currently, `Neo.grid.Body.createViewData` calls `updateContent` on all visible rows during every scroll tick.
`Neo.grid.Row.updateContent` unconditionally calls `createVdom`, even if the record and row index are identical.
This results in thousands of unnecessary VDOM re-generations and `cellRenderer` executions (e.g., Component columns) during simple scrolling.

**Changes:**
1.  **Neo.grid.Row**: Update `updateContent` to accept a `force` flag. Skip `createVdom` if `!force`, `record`, and `rowIndex` are unchanged.
2.  **Neo.grid.Body**:
    -   Update `createViewData` to accept `force`.
    -   Track `lastMountedColumns` to auto-detect if horizontal scrolling/resizing requires a forced update.
    -   Pass `force` to `row.updateContent`.
3.  **Review Triggers**: Ensure other config changes (like `commitsOnly` in DevIndex) properly trigger a forced update.

## Timeline

- 2026-02-14T23:39:32Z @tobiu added the `bug` label
- 2026-02-14T23:39:32Z @tobiu added the `ai` label
- 2026-02-14T23:39:32Z @tobiu added the `performance` label
- 2026-02-14T23:52:06Z @tobiu referenced in commit `0a43dba` - "perf(grid): Optimize VDOM generation in Row.updateContent (#9156)"
- 2026-02-14T23:52:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-14T23:52:23Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the optimizations for `Neo.grid.Row.updateContent` and `Neo.grid.Body.createViewData`.
> 
> **Changes:**
> 1.  **Row Optimization:** `Row.updateContent` now skips VDOM generation if the record and row index have not changed, provided `force` is false.
> 2.  **Force Updates:** Added a `force` parameter to `createViewData` and `updateContent` to override this check when necessary (e.g., column resizing, horizontal scrolling).
> 3.  **Auto-Detection:** `GridBody` now tracks `mountedColumns` changes to automatically trigger forced updates during horizontal scrolling.
> 4.  **DevIndex Integration:** Updated `GridContainer` to explicitly force updates when toggling "Commits Only", ensuring column swaps reflect immediately.
> 
> **Performance Impact:**
> -   **Streaming:** `cellRenderer` calls reduced from ~5460 to ~210.
> -   **Vertical Scrolling:** `cellRenderer` calls reduced from ~7000 to ~30 (only new rows).
> 
> I am closing this ticket as the primary optimization is complete. Horizontal scrolling optimization will be tracked separately.

- 2026-02-14T23:52:44Z @tobiu closed this issue
- 2026-02-15T00:32:29Z @tobiu cross-referenced by #9158

