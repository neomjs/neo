---
id: 7181
title: Optimize `table.Body` for Store Clearing with Fast Path
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T12:11:45Z'
updatedAt: '2025-08-11T12:12:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7181'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-11T12:12:16Z'
---
# Optimize `table.Body` for Store Clearing with Fast Path

**Is your feature request related to a problem? Please describe.**

The `Neo.table.Body` component, which is non-buffered, was not optimized for cases where its connected store is cleared (e.g., via `store.removeAll()` or loading an empty dataset). When this happened with a table containing a large number of rows, the `onStoreLoad` method would call `createViewData()`, resulting in a full VDOM diff between all existing rows and the new empty state. While fast, this is an unnecessary operation that can be avoided.

**Describe the solution you'd like**

The `onStoreLoad` method in `src/table/Body.mjs` has been updated to include the same "fast path" optimization that was previously implemented for `grid.Body`.

The new logic is as follows:
1.  At the beginning of `onStoreLoad`, it checks if the incoming `data.items` array from the `load` event is empty.
2.  If the array is empty and the table body currently has rows, it bypasses the standard `createViewData()` call.
3.  Instead, it directly clears the internal VDOM array (`vdomRoot.cn = []`), clears the VNode cache (`me.getVnodeRoot().childNodes = []`), and sends a single, direct delta to the main thread (`Neo.applyDeltas(...)`) to set the `textContent` of the table body to an empty string.
4.  If the incoming data is not empty, it proceeds with the standard `createViewData()` call as before.

**Benefits of this approach:**

*   **Drastic Performance Improvement:** Significantly reduces the time and CPU load required to clear a large table, making the UI feel more responsive.
*   **Code Consistency:** Aligns the behavior of `table.Body` with `grid.Body`, making the framework more consistent and predictable.
*   **Improved Efficiency:** Avoids a large and unnecessary VDOM diffing operation for a common use case.

## Timeline

- 2025-08-11T12:11:45Z @tobiu assigned to @tobiu
- 2025-08-11T12:11:47Z @tobiu added the `enhancement` label
- 2025-08-11T12:12:07Z @tobiu referenced in commit `86a61ac` - "Optimize table.Body for Store Clearing with Fast Path #7181"
- 2025-08-11T12:12:16Z @tobiu closed this issue

