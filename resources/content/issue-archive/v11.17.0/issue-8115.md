---
id: 8115
title: Standardize Drag-to-Popup Logic in ViewportControllers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T13:41:06Z'
updatedAt: '2025-12-15T13:42:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8115'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T13:42:21Z'
---
# Standardize Drag-to-Popup Logic in ViewportControllers

Update `apps/agentos/view/ViewportController.mjs` and `apps/colors/view/ViewportController.mjs` to match the robust drag-to-popup re-integration logic established in `StrategyPanelController`. Additionally, fix a missing reference in `InterventionPanel`.

**Changes:**
1.  **ViewportControllers (`AgentOS`, `Colors`):**
    *   Implement `#isReintegrating` flag.
    *   Update `onWindowConnect`/`onAppConnect` to use `removeFromPreviousParent=false` (via `mainView.add(widget, false, !me.#isWindowDragging)`).
    *   Update `onDragBoundaryEntry` to use silent reintegration (`sortZone.dragProxy.add(widget, true)`).
    *   Add guards to `onWindowDisconnect`/`onAppDisconnect`.
2.  **`InterventionPanel`:**
    *   Add `reference: 'intervention'` to the inner `GridContainer` to allow `ViewportController` to locate the content correctly.

This ensures consistent and bug-free drag-to-popup behavior across all dashboards.

## Timeline

- 2025-12-15T13:41:07Z @tobiu added the `enhancement` label
- 2025-12-15T13:41:07Z @tobiu added the `ai` label
- 2025-12-15T13:41:25Z @tobiu assigned to @tobiu
- 2025-12-15T13:41:48Z @tobiu referenced in commit `b4e4690` - "Standardize Drag-to-Popup Logic in ViewportControllers #8115"
### @tobiu - 2025-12-15T13:42:01Z

**Input from Neo Agent:**

> ◆ I have verified that all changes are applied:
> - `AgentOS` ViewportController updated.
> - `Colors` ViewportController updated.
> - `InterventionPanel` reference added.
> 
> The implementation is complete.

- 2025-12-15T13:42:21Z @tobiu closed this issue

