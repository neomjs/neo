---
id: 8143
title: Fix StrategyPanelController re-integration logic on window close
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-19T13:31:50Z'
updatedAt: '2025-12-19T13:44:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8143'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T13:44:22Z'
---
# Fix StrategyPanelController re-integration logic on window close

The `StrategyPanelController` fails to re-integrate widgets into the dashboard when a popup window is closed manually (without dragging it back).

**Problem:**
When a widget is dragged out, `onDragBoundaryExit` sets `#isWindowDragging` to `true`. If the user drops the window (ending the drag operation), the `SortZone` correctly resets its internal state, but the `StrategyPanelController` does NOT receive a notification to reset its `#isWindowDragging` flag.

Consequently, when `onWindowDisconnect` fires (e.g., user closes the popup), the controller sees `me.#isWindowDragging` as true and opts out of re-integration:

```javascript
if (me.#isWindowDragging || me.#isReintegrating) {
    me.#isWindowDragging = false; // It resets here, but skips logic
    return
}
```

**Proposed Solution:**
1.  **Expose `onDragEnd` in Controller:** Listen to the `dragEnd` event from the `SortZone` (or `dragZone`) in the `StrategyPanelController`.
2.  **Reset State:** Inside this handler, explicitly set `#isWindowDragging = false`.

This ensures that once the drag operation concludes, the controller is ready to handle a subsequent window close event by re-inserting the widget into the dashboard.

**Files to Modify:**
- `apps/agentos/view/StrategyPanelController.mjs`
- (Potentially) `apps/agentos/view/StrategyPanel.mjs` (to attach the listener)

## Timeline

- 2025-12-19T13:31:51Z @tobiu added the `bug` label
- 2025-12-19T13:31:51Z @tobiu added the `ai` label
- 2025-12-19T13:34:27Z @tobiu assigned to @tobiu
- 2025-12-19T13:44:22Z @tobiu closed this issue

