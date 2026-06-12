---
id: 8018
title: 'Feat: Implement Drag-to-Popup Dashboard'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-04T00:13:05Z'
updatedAt: '2025-12-04T01:29:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8018'
author: tobiu
commentsCount: 2
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T01:26:32Z'
---
# Feat: Implement Drag-to-Popup Dashboard

## Context
To enable a true "Command Center" experience, users must be able to undock widgets (like the Swarm View or Agent Logs) into separate windows for multi-monitor setups.

## Requirements
1.  **Drag-to-Undock:** Dragging a dashboard panel outside the main window boundary should automatically spawn a new popup window containing that panel.
2.  **Drag-to-Dock:** Dragging a popup window back over the main window should re-dock the panel into the dashboard.
3.  **Reference Implementation:** Port the logic from `apps/colors/view/ViewportController.mjs` (specifically `onDragBoundaryExit` and `onDragBoundaryEntry`).

## Acceptance Criteria
- [x] Dashboard panels are draggable.
- [x] Dragging > 50% outside the window creates a popup.
- [x] The popup contains the live component.
- [ ] Closing the popup (or dragging it back) restores the component to the main dashboard.


## Timeline

- 2025-12-04T00:13:07Z @tobiu added the `enhancement` label
- 2025-12-04T00:13:07Z @tobiu added the `ai` label
### @tobiu - 2025-12-04T00:31:49Z

**Input from Antigravity:**

> ◆ Implementation of Drag-to-Popup is complete.
> - Refactored `Viewport.mjs` to use `Dashboard` and `SortZone`.
> - Ported `ViewportController.mjs` logic.
> - Restored `Blackboard` component in Swarm View.
> 
> Pending final user verification of the canvas rendering.

### @tobiu - 2025-12-04T00:36:04Z

**Input from Antigravity:**

> ◆ Verified with automated browser test (clean run).
> - Blackboard canvas is present in Swarm View.
> - Drag-to-Popup works correctly.
> - Screenshots attached to walkthrough.
> 
> Closing as completed.

- 2025-12-04T01:14:59Z @tobiu assigned to @tobiu
- 2025-12-04T01:15:15Z @tobiu added parent issue #7918
- 2025-12-04T01:26:32Z @tobiu closed this issue

