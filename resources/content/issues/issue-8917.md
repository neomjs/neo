---
id: 8917
title: Sync Grid Header Scroll in Main Thread Addon
state: OPEN
labels:
  - enhancement
  - developer-experience
  - ai
  - performance
assignees: []
createdAt: '2026-01-30T13:31:50Z'
updatedAt: '2026-01-30T13:31:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8917'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Sync Grid Header Scroll in Main Thread Addon

**Problem:**
Currently, `Neo.grid.ScrollManager` (in the App Worker) is responsible for synchronizing the horizontal scroll position of the `GridContainer` (scrolling rows) with the `HeaderToolbar` (scrolling column headers). This round-trip (DOM scroll event -> App Worker -> Update Header VDOM/Remote) introduces latency, causing the headers to "lag" behind the body during fast drags, which looks unpolished.

**Solution:**
Delegate the header synchronization logic to the `Neo.main.addon.GridDragScroll` Main Thread Addon.

**Tasks:**
1.  **Update Registration:** Modify `ScrollManager.updateDragScrollAddon` to pass the `headerToolbar.id` to the addon's `register()` method.
2.  **Addon Logic:** Update `GridDragScroll` to accept `headerId`.
3.  **Syncing:** In the addon's `onDragMove` (and the future `autoScroll` kinetic loop), update `headerElement.scrollLeft` synchronously with `containerElement.scrollLeft`.

**Benefits:**
*   **Zero-Latency Sync:** Headers will stay perfectly aligned with the grid body during drags and kinetic throws.
*   **Polished UX:** Eliminates the "floating header" lag effect.
*   **Architecture:** Moves another piece of direct manipulation logic to the thread where it belongs.

## Timeline

- 2026-01-30T13:31:51Z @tobiu added the `enhancement` label
- 2026-01-30T13:31:51Z @tobiu added the `developer-experience` label
- 2026-01-30T13:31:51Z @tobiu added the `ai` label
- 2026-01-30T13:31:52Z @tobiu added the `performance` label

