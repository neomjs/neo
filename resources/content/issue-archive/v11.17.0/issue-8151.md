---
id: 8151
title: Fix Grid Scroll Flickering & Enhance VDOM State Synchronization
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-20T15:06:31Z'
updatedAt: '2025-12-20T15:09:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8151'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-20T15:09:45Z'
---
# Fix Grid Scroll Flickering & Enhance VDOM State Synchronization

## Description
This ticket addresses a critical race condition in the Buffered Grid component that caused visual flickering and infinite scroll loops during rapid scrolling. It also introduces a significant architectural enhancement to the VDOM state synchronization mechanism to ensure data consistency across worker threads.

## The Issue
The Grid component suffered from a conflict between two scroll handling mechanisms:
1.  **Implicit:** The global `DomEvent` hotpath calling `onScrollCapture` (sync), updating `vnode`/`vdom`.
2.  **Explicit:** `ScrollManager` attaching manual `scroll` listeners (async/throttled) triggering `update()`.

During rapid scrolling, the VDOM Worker would receive updates with conflicting or out-of-sync scroll states. Furthermore, the roundtrip to the VDOM worker resulted in a "clean" VNode structure that lacked the latest Main Thread scroll state captured by `onScrollCapture`. This caused the worker to generate "reset" deltas (e.g., setting `scrollTop` to 0), forcing the browser to jump and restarting the loop.

## Changes

### 1. Grid Scroll Logic Refactoring
-   **Single Source of Truth:** Removed the manual `scroll` listeners from `src/grid/ScrollManager.mjs`.
-   **`onScrollCapture` Implementation:** Implemented `onScrollCapture` in `src/grid/Body.mjs` and `src/grid/Container.mjs`.
    -   Calls `super.onScrollCapture(data)` to synchronously sync `vnode` and `vdom` state.
    -   Forwards the event to `ScrollManager` to trigger the virtual row rendering logic.

### 2. VDOM State Synchronization Enhancement
-   **Renaming:** Renamed `syncVdomIds` to `syncVdomState` globally (`src/util/VDom.mjs`, `src/mixin/VdomLifecycle.mjs`, usages) to reflect its expanded scope.
-   **Bidirectional Scroll Sync:** Enhanced `src/util/VDom.mjs` to synchronize scroll state:
    -   **Preservation (VDOM -> VNode):** Ensures that the live scroll position captured on the Main Thread (stored in `vdom`) overrides potentially stale state returning from the VDOM Worker. This prevents the worker response from resetting the scroll position.
    -   **Rehydration (VNode -> VDOM):** Ensures that new VDOM trees (e.g., from Functional Components) inherit the persistent scroll state from the existing VNode.
-   **Documentation:** Updated JSDoc for `syncVdomState` to explicitly explain the ID generation necessity and the bidirectional scroll logic.

## Impact
-   Eliminates grid scroll flickering and loops.
-   Ensures VDOM/VNode consistency even when mutating state while update roundtrips are in flight.
-   Improves stability for all components using `saveScrollPosition`.

## Timeline

- 2025-12-20T15:06:32Z @tobiu added the `bug` label
- 2025-12-20T15:06:32Z @tobiu added the `enhancement` label
- 2025-12-20T15:06:32Z @tobiu added the `ai` label
- 2025-12-20T15:06:32Z @tobiu added the `core` label
- 2025-12-20T15:06:52Z @tobiu assigned to @tobiu
- 2025-12-20T15:09:02Z @tobiu referenced in commit `83c413c` - "https://github.com/neomjs/neo/issues/8151"
- 2025-12-20T15:09:45Z @tobiu closed this issue

