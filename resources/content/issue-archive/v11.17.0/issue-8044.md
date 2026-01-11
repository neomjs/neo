---
id: 8044
title: '[Draggable] Implement DragProxyContainer for live component dragging'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T12:12:26Z'
updatedAt: '2025-12-07T12:23:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8044'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T12:23:35Z'
---
# [Draggable] Implement DragProxyContainer for live component dragging

We are introducing `Neo.draggable.DragProxyContainer` to enable dragging "live" components (like `OffscreenCanvas` based charts) without losing their state or worker connection.

**Context:**
Currently, `DragZone` creates a `DragProxyComponent` which is populated with a **clone** of the dragged element's VDOM. This works well for static content but fails for components that rely on specific DOM node instances or worker connections (e.g., `Canvas`), as the clone is a new, disconnected DOM element.

**The Solution:**
1.  **New Class:** `Neo.draggable.DragProxyContainer`
    *   Extends `Neo.container.Base`.
    *   Reuses the `.neo-dragproxy` styling from `DragProxyComponent` via manual theme injection (overriding `afterSetWindowId`).
    *   Designed to host the *actual* component instance during the drag.

2.  **Updated `DragZone`:**
    *   `createDragProxy` now supports a "live move" mode. If the `dragProxyConfig.module` is set to `DragProxyContainer`:
        *   The dragged component is **moved** from its source container into the proxy container.
        *   A hidden placeholder component (`Neo.component.Base`) is inserted into the source container to preserve the visual gap and layout flow.
    *   `dragEnd` restores the component to its original location (replacing the placeholder).

3.  **Updated `SortZone`:**
    *   Updated `onDragStart` to be aware of the placeholder swap. It now sorts the placeholder (the gap) instead of the moved component, ensuring the sorting logic works correctly with the background layout.

**Affected Files:**
*   `src/draggable/DragProxyContainer.mjs` (New)
*   `src/draggable/DragZone.mjs`
*   `src/draggable/container/SortZone.mjs`

**Next Steps:**
This implementation provides the architectural capability. A follow-up task is required to integrate this into the AgentOS app (specifically for the Swarm View / Blackboard) to verify that the `OffscreenCanvas` connection persists during the drag.

## Timeline

- 2025-12-07T12:12:27Z @tobiu added the `enhancement` label
- 2025-12-07T12:12:27Z @tobiu added the `ai` label
- 2025-12-07T12:12:49Z @tobiu assigned to @tobiu
- 2025-12-07T12:14:17Z @tobiu referenced in commit `497c8e7` - "feat(Draggable): Implement DragProxyContainer for live component dragging #8044

- Added Neo.draggable.DragProxyContainer to support moving live components into the proxy.
- Updated DragZone to handle the component swap with a placeholder when using the container proxy.
- Updated SortZone to track and sort the placeholder to maintain correct layout gaps.
- Ensured DragProxyContainer reuses DragProxyComponent styling to avoid SCSS duplication."
- 2025-12-07T12:23:35Z @tobiu closed this issue

