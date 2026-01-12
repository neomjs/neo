---
id: 8144
title: 'Fix: StrategyPanelController widget re-integration fails to update DOM'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-19T13:44:50Z'
updatedAt: '2025-12-19T15:15:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8144'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T15:15:53Z'
---
# Fix: StrategyPanelController widget re-integration fails to update DOM

**Problem:**
When dragging a widget out of the dashboard into a popup window, the widget was not being removed from the dashboard's items array because removeFromPreviousParent was set to false during the move. This led to:
1.  **Duplicate References:** Upon re-integration (closing the popup), the widget was inserted back into the dashboard, causing duplicate entries in the items array.
2.  **Destruction Issues:** In complex drag scenarios (out -> in -> out), the widget could be inadvertently destroyed when the drag proxy was cleaned up.

**Solution:**
1.  **Dashboard Cleanup:** Enhanced StrategyPanelController.onDragEnd() to explicitly remove the dragged item from the dashboard's items array if the drag operation concluded with a window detachment (isWindowDragging: true). This ensures the dashboard state is clean while the widget lives in the popup.
2.  **Proxy Protection:** Updated src/draggable/DragProxyContainer.mjs with a custom destroy() method that clears its items array before calling super.destroy(). This prevents the destruction of child widgets (the dragged item) when the drag proxy is destroyed at the end of a drag operation.

This combination ensures robust re-integration even after multiple drag interactions.

## Timeline

- 2025-12-19T13:44:52Z @tobiu added the `bug` label
- 2025-12-19T13:44:52Z @tobiu added the `ai` label
- 2025-12-19T13:46:07Z @tobiu assigned to @tobiu
- 2025-12-19T15:15:43Z @tobiu referenced in commit `4b9ac67` - "Fix: StrategyPanelController widget re-integration fails to update DOM #8144"
- 2025-12-19T15:15:53Z @tobiu closed this issue

