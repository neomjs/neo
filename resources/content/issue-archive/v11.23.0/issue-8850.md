---
id: 8850
title: Fix VDOM ID Mismatch in Cross-Window Move (LivePreview Helix Detach)
state: CLOSED
labels:
  - bug
  - ai
  - regression
  - core
assignees:
  - tobiu
createdAt: '2026-01-21T12:46:02Z'
updatedAt: '2026-01-21T15:18:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8850'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T15:18:12Z'
---
# Fix VDOM ID Mismatch in Cross-Window Move (LivePreview Helix Detach)

The VDOM `createDeltas` method is failing with an ID mismatch error during a cross-window move operation involving `LivePreview`.

**Scenario:**
1.  Open Portal App Home.
2.  Interact with the "Helix" Live Preview (`Portal.view.home.parts.Helix`), which renders `examples.component.multiWindowHelix`.
3.  Click "Detach Window" for the Helix Controls panel.
4.  **Result:** The new window opens and renders correctly, BUT the original content in the main window is NOT removed.
5.  **Error:** The VDOM worker throws:
    `Error: createDeltas() must be called for the same node. new: {id: neo-container-35, cId: neo-container-35}, old: {id: undefined, cId: neo-container-35}`

**Analysis:**
The error `old: {id: undefined, cId: neo-container-35}` suggests that the `vnodeMap` lookup for the old node is failing to find the correct VDOM node, likely because `id` is missing on the stored VNode, even though `componentId` is present.

This typically happens when `moveNode` attempts to process a move for a component reference.
The Teleportation update might be generating disjoint payloads that interact poorly with `moveNode` when a component is being moved *out* of a container (detachment).

We need to investigate `vdom.Helper.createDeltas` and `moveNode` logic, specifically how they handle component placeholders during batched updates.

## Timeline

- 2026-01-21T12:46:03Z @tobiu added the `bug` label
- 2026-01-21T12:46:04Z @tobiu added the `ai` label
- 2026-01-21T12:46:04Z @tobiu added the `regression` label
- 2026-01-21T12:46:04Z @tobiu added the `core` label
- 2026-01-21T14:11:49Z @tobiu referenced in commit `37e9a9c` - "fix(VdomLifecycle): Fix Teleportation race conditions and cross-window leaks (#8850)"
- 2026-01-21T14:12:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-21T14:12:56Z

**Input from Gemini 3 Pro:**

> ✦ Fixed critical regressions in VDOM Teleportation and SharedWorker support.
> 
> **Summary of Fixes:**
> 
> 1.  **Race Condition (`src/mixin/VdomLifecycle.mjs`):**
>     -   **Problem:** `executeVdomUpdate` was synchronously snapshotting the VDOM via `collectPayloads` *before* subsequent synchronous DOM mutations (like `Container.remove`) in the same tick could complete. This resulted in "stale payloads" where removed components persisted as "Ghost Content".
>     -   **Fix:** Added `await new Promise(resolve => setTimeout(resolve, 1))` to `executeVdomUpdate`. This forces a Macrotask yield, ensuring `collectPayloads` runs *after* all pending synchronous logic and microtasks have settled, capturing the correct clean state.
> 
> 2.  **Cross-Window Leak (`src/mixin/VdomLifecycle.mjs`):**
>     -   **Problem:** Merged components (children) that moved to a new window were still included in the old parent's update batch. This caused deltas meant for the New Window (e.g., hiding a header) to be applied to the Old Window, corrupting the "Ghost Panel" state.
>     -   **Fix:** Added filtering in `collectPayloads` to strictly exclude components where `component.windowId !== me.windowId`.
> 
> 3.  **Blocked Update Registry (`src/manager/VDomUpdate.mjs`):**
>     -   **Problem:** `unregisterInFlightUpdate` used `getParentIds(component)` to clear the "in-flight" status from ancestors. If a component moved during the update, this function returned the *new* parents, leaving the *old* parent (`Viewport`) permanently blocked (`isChildUpdating` = true).
>     -   **Fix:** Refactored to iterate `descendantInFlightMap` directly, ensuring *all* registered ancestors are cleared regardless of hierarchy changes.
> 
> 4.  **Component ID Stability (`src/manager/Component.mjs`):**
>     -   **Problem:** Placeholders stored in `me.vnode` were missing `id` if they matched `componentId`, causing strict diffing errors in `vdom.Helper`.
>     -   **Fix:** Updated `addVnodeComponentReferences` to always assign `id`.
> 
> 5.  **Race Condition (`examples/component/multiWindowHelix/ViewportController.mjs`):**
>     -   **Problem:** Logic toggled `header.hidden` *before* re-attaching the panel to the viewport, causing an independent update that raced with the insert.
>     -   **Fix:** Swapped order to ensure correct hierarchy merging.
> 
> **Result:**
> The Helix example now correctly detaches and re-attaches the controls panel across windows without artifacts, ghost content, or errors.

- 2026-01-21T14:17:03Z @tobiu referenced in commit `c3ebf6b` - "fix(Gallery): Fix re-attach race condition and add regression test (#8850)"
- 2026-01-21T15:18:12Z @tobiu closed this issue

