---
id: 9108
title: 'Grid Body fast path fails to update Row mounted state, breaking OffscreenCanvas recovery'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-11T23:28:54Z'
updatedAt: '2026-02-11T23:56:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9108'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T23:56:16Z'
---
# Grid Body fast path fails to update Row mounted state, breaking OffscreenCanvas recovery

The `Neo.grid.Body#onStoreLoad` method has a "fast path" for clearing the grid when the store has 0 items (e.g., due to filtering). This path directly clears the VDOM children (`vdomRoot.cn = []`) and the real DOM (`textContent: ''`) to avoid expensive VDOM diffing.

However, this bypasses the standard lifecycle updates for the pooled `Row` components. They remain in `me.items` with `mounted: true`, even though they are physically removed from the DOM.

When the store reloads with data, these `Row` components are re-added to the VDOM. Since their `mounted` config is still `true`, the `afterSetMounted` hook is not triggered. This prevents child components like `OffscreenCanvas` (used in Sparklines) from triggering their reconnection logic ("healing"), causing charts to disappear.

**Proposed Fix:**
1.  In `onStoreLoad` (fast path): Explicitly set `mounted = false` for all `Row` items.
2.  In `createViewData`: Explicitly ensure `mounted = true` for all `Row` items if the Body itself is mounted.

This synchronizes the component state with the physical DOM state while preserving the performance benefits of the fast path.


## Timeline

- 2026-02-11T23:28:56Z @tobiu added the `bug` label
- 2026-02-11T23:28:56Z @tobiu added the `ai` label
- 2026-02-11T23:28:59Z @tobiu added parent issue #9106
- 2026-02-11T23:54:55Z @tobiu referenced in commit `154759c` - "fix: Remove Grid Body fast path optimization to fix OffscreenCanvas reconnection (#9108)"
- 2026-02-11T23:55:11Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-11T23:55:19Z

**Input from Gemini 3 Pro:**

> ✦ Fixed by removing the `onStoreLoad` fast path optimization in `src/grid/Body.mjs`.
> 
> **Rationale:**
> The fast path (clearing DOM via `textContent = ''` when store count is 0) was a legacy optimization designed before the **Row Pooling** architecture. With the current Fixed-DOM-Order strategy, this optimization became harmful: it destroyed the DOM nodes that pooled rows relied on, severing the connection between `OffscreenCanvas` components and their worker threads.
> 
> By removing the fast path, clearing the grid (0 items) now efficiently updates the pooled rows to be hidden (`display: none`) instead of destroying them. This preserves the DOM nodes and the Component instances, ensuring that `OffscreenCanvas` connections remain active for when data is reloaded, thus fixing the reconnection issue without requiring complex "healing" logic.
> 
> **Note:** Row Pooling ensures that this operation remains O(PoolSize) efficient, not O(TotalRecords).

- 2026-02-11T23:56:16Z @tobiu closed this issue

