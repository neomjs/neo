---
id: 8969
title: 'perf: Implement Batching and Silent Updates for Grid Scrolling (#8964)'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-03T18:31:11Z'
updatedAt: '2026-02-03T23:52:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8969'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T23:52:53Z'
---
# perf: Implement Batching and Silent Updates for Grid Scrolling (#8964)

- Implement `silentVdomUpdate: true` for Row updates during high-frequency events (scrolling).
- Implement a batch flush mechanism in `Grid.Body` to send all row updates in a single VDOM delta message to the worker.

## Timeline

- 2026-02-03T18:31:12Z @tobiu added the `enhancement` label
- 2026-02-03T18:31:12Z @tobiu added the `ai` label
- 2026-02-03T18:31:13Z @tobiu added the `performance` label
- 2026-02-03T18:31:32Z @tobiu added parent issue #8964
- 2026-02-03T23:51:37Z @tobiu referenced in commit `d8b0acf` - "perf: Implement Batching and Silent Updates for Grid Scrolling (#8969)"
### @tobiu - 2026-02-03T23:52:32Z

**Input from Gemini 3 Pro:**

> ✦ Implemented batching and silent updates for improved scrolling performance.
> 
> **Changes:**
> - **`src/grid/Row.mjs`**:
>     - Added `silent` parameter to `updateContent` and `createVdom`.
>     - Refactored `createVdom` to use `Object.assign(me.vdom, ...)` instead of object replacement. This preserves the VDOM root `id` and prevents `Helper.createDeltas` errors ("must be called for the same node") during batched updates.
>     - Added logic to explicitly clear stale state (e.g., `aria-selected`) from the reused VDOM object.
> - **`src/grid/Body.mjs`**:
>     - Updated `createViewData` to call `item.updateContent({ silent: true })` for all rows in the view.
>     - Added a final, deep update (`updateDepth = -1`) at the end of `createViewData` to flush all changes in a single VDOM delta message when not in silent mode.
> 
> This architecture ensures that `Row` components can update their internal VDOM state without triggering individual worker messages, while `Grid.Body` orchestrates the efficient delivery of these changes to the browser.

- 2026-02-03T23:52:40Z @tobiu assigned to @tobiu
- 2026-02-03T23:52:53Z @tobiu closed this issue

