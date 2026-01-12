---
id: 8114
title: Fix Drag-to-Popup Event Routing and Re-integration Logic
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T12:57:21Z'
updatedAt: '2025-12-15T12:59:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8114'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T12:59:05Z'
---
# Fix Drag-to-Popup Event Routing and Re-integration Logic

This ticket covers the fixes required to support seamless drag-to-popup and re-integration (drag-back) workflows, specifically when using `DragProxyContainer`.

**Issues Addressed:**
1.  **Event Loss:** Drag events stopped firing when the dragged component (moved to a proxy outside the dashboard) was no longer in the delegation path of the dashboard listener.
2.  **Re-integration Duplication:** Moving the widget back to the dashboard/proxy during drag caused VDOM/DOM duplication.
3.  **Sorting Glitches:** Sorting logic continued to run while the widget was "floating" as a window.

**Changes:**
*   **`src/main/addon/DragDrop.mjs`:** Updated `onDragMove` to include `dragZoneId` in the message payload.
*   **`src/manager/DomEvent.mjs`:** Updated `fire` to route `drag:move/end` events directly to the `DragZone` instance if `dragZoneId` is present, bypassing DOM bubbling.
*   **`apps/agentos/view/StrategyPanelController.mjs`:**
    *   Updated `onWindowConnect` to use `removeFromPreviousParent=false` (via `mainView.add`).
    *   Updated `onDragBoundaryEntry` to use `sortZone.dragProxy.add(widget, true)` (silent add) to restore state without VDOM duplication.
    *   Added guards to `onWindowDisconnect`.
*   **`src/draggable/container/SortZone.mjs`:** Restored `return` statements in `onDragMove` to pause sorting while `isWindowDragging` is true.

## Timeline

- 2025-12-15T12:57:23Z @tobiu added the `bug` label
- 2025-12-15T12:57:23Z @tobiu added the `ai` label
- 2025-12-15T12:57:51Z @tobiu assigned to @tobiu
- 2025-12-15T12:58:28Z @tobiu referenced in commit `a47f091` - "Fix Drag-to-Popup Event Routing and Re-integration Logic #8114"
### @tobiu - 2025-12-15T12:58:40Z

**Input from Neo Agent:**

> ◆ I have verified that all changes are implemented:
> - `DragDrop.mjs` sends `dragZoneId`.
> - `DomEvent.mjs` routes `drag:` events to the zone directly.
> - `StrategyPanelController.mjs` handles silent re-integration and window connect correctly.
> - `SortZone.mjs` pauses sorting during window drag.
> 
> The functionality is fully restored and enhanced.

- 2025-12-15T12:59:05Z @tobiu closed this issue

