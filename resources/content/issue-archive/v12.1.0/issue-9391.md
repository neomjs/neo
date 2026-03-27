---
id: 9391
title: 'E2E: Refactor GridRowScrollPinning to Hybrid rAF Engine'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T14:28:31Z'
updatedAt: '2026-03-08T14:30:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9391'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T14:30:36Z'
---
# E2E: Refactor GridRowScrollPinning to Hybrid rAF Engine

This ticket documents the pivot to the **Hybrid Engine** for the `GridRowScrollPinning` addon.

The initial implementation relied on intercepting VDOM deltas directly as they arrived from the App Worker. However, testing revealed that native browser scrolling runs at 60fps, while worker updates are much slower (often >50ms during heavy layout). This discrepancy meant that the addon was only updating the pinning transform when a message arrived, rather than staying perfectly synced with the physical scrollbar thumb, causing extreme visual jitter.

**The Pivot:**
We have refactored the addon into a Hybrid architecture:
1.  **Stateful Updates:** VDOM updates from the App Worker (`onDeltaUpdate`) no longer mutate the DOM. They only update an internal `workerScrollTop` reference state.
2.  **Scroll Driven:** A native `scroll` event listener is attached to the Grid Wrapper node.
3.  **rAF Loop:** The native scroll event triggers a `requestAnimationFrame` loop.
4.  **Continuous Pinning:** Inside the rAF loop, the addon calculates `deltaY` (`actualScrollTop - workerScrollTop`) and applies the `translate3d` CSS transform to the Grid Body content node on every frame, achieving perfect 60fps optical pinning regardless of worker latency.
5.  **Hysteresis Logic:** The addon enters an `isPinned` state when `deltaY > rowHeight` and stays pinned until `deltaY` falls below `2px` to prevent flickering on micro-scrolls.

**Completed Changes:**
- Completely rewrote `src/main/addon/GridRowScrollPinning.mjs` to implement the `requestAnimationFrame` and native scroll listener loop.
- Reverted the registration lifecycle in `src/grid/ScrollManager.mjs` to properly use `afterSetMounted`, as the addon now requires the DOM to be ready to attach the scroll listener.
- Temporarily added console logging logic for debugging.

This sub-ticket serves to commit this architectural baseline to the repository before further exploration of sync frequency vs performance.

## Timeline

- 2026-03-08T14:28:32Z @tobiu added the `enhancement` label
- 2026-03-08T14:28:32Z @tobiu added the `ai` label
- 2026-03-08T14:28:32Z @tobiu added the `architecture` label
- 2026-03-08T14:28:32Z @tobiu added the `grid` label
- 2026-03-08T14:29:07Z @tobiu added parent issue #9380
- 2026-03-08T14:30:03Z @tobiu referenced in commit `92ca86d` - "Enhancement: Refactor GridRowScrollPinning to Hybrid rAF Engine (#9391)

- Rewrote GridRowScrollPinning to use a continuous requestAnimationFrame loop driven by native scroll events to achieve perfect 60fps syncing against the massive DOM layer.
- VDOM delta updates now only modify the internal baseline state without touching the DOM.
- Implemented hysteresis logic (isPinned) to maintain stable pinning states.
- Reverted the addon registration back to the afterSetMounted lifecycle hook, as it now requires DOM node access for event listeners."
### @tobiu - 2026-03-08T14:30:13Z

**Input from Gemini 3.1 Pro:**

> ✦ The Hybrid Architecture baseline has been committed and pushed to the repository. The testing logs have been removed.
> 
> This version provides a clean starting point for testing different frequency strategies (like direct scroll event injection vs rAF). 
> 
> Closing this ticket as requested by the user.

- 2026-03-08T14:30:22Z @tobiu assigned to @tobiu
- 2026-03-08T14:30:36Z @tobiu closed this issue

