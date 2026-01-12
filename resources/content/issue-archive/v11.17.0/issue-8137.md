---
id: 8137
title: 'Feature Request: Component saveScrollPosition config'
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2025-12-17T03:53:50Z'
updatedAt: '2025-12-17T14:06:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8137'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T14:06:45Z'
---
# Feature Request: Component saveScrollPosition config

Add a new config `saveScrollPosition` (default `true`) to `Neo.component.Abstract`.

**Goal:**
Automatically preserve the scroll position of a component's DOM nodes when they are unmounted and re-mounted (e.g., in `Card` layout or when moving components between windows).

**Implementation Details:**

This feature was implemented by treating `scrollTop` and `scrollLeft` as **top-level properties** of the VNode structure, elevating them to first-class citizens alongside `id` and `childNodes`. This architectural choice provides cleaner access and semantic correctness (they are DOM properties, not HTML attributes).

**Changes:**

1.  **Architecture:** Adopted a top-level property approach for scroll state on VNode objects.
2.  **`src/vdom/VNode.mjs`**: Enhanced constructor to accept and document top-level `scrollTop` and `scrollLeft` properties.
3.  **`src/vdom/Helper.mjs`**:
    *   Updated `createVnode` to pass these properties through to the VNode instance.
    *   Updated `compareAttributes` to detect changes in these top-level properties and include them in the delta updates.
4.  **`src/main/DeltaUpdates.mjs`**: Updated `updateNode` to handle these new delta keys by applying them directly to the DOM node properties (e.g., `node.scrollTop = value`).
5.  **`src/component/Abstract.mjs`**:
    *   Added `saveScrollPosition` config (default `true`).
    *   Added `onScrollCapture` method to update the persistent `vnode` state (in App worker) without triggering re-renders.
6.  **`src/component/Base.mjs`**: Overridden `onScrollCapture` to also keep the persistent `_vdom` structure in sync for class-based components.
7.  **`src/functional/component/Base.mjs`**: Overridden `syncVdomIds` to hydrate the ephemeral `vdom` with `scrollTop` and `scrollLeft` values from the persistent `vnode` state during functional component re-renders.
8.  **`src/manager/DomEvent.mjs`**: Enhanced `fire()` to intercept `scroll` events and trigger `onScrollCapture` on the target component before processing standard listeners.

**Note:**
Current implementation handles live DOM updates (capturing scroll) and VDOM/VNode synchronization. **However, re-mounting (restoring scroll position on node insertion) is NOT yet handled.** This is a follow-up item that requires updates to specific renderers/mount adapters to ensure nodes are created/inserted with the correct scroll properties.


## Timeline

- 2025-12-17T03:53:51Z @tobiu added the `enhancement` label
- 2025-12-17T03:53:51Z @tobiu added the `ai` label
- 2025-12-17T03:53:52Z @tobiu added the `feature` label
- 2025-12-17T13:59:45Z @tobiu assigned to @tobiu
- 2025-12-17T14:01:33Z @tobiu referenced in commit `5ffb631` - "Feature Request: Component saveScrollPosition config #8137"
- 2025-12-17T14:06:45Z @tobiu closed this issue
- 2025-12-17T14:19:57Z @tobiu cross-referenced by #8138

