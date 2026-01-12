---
id: 7206
title: Initial Dashboard Drag & Drop
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-08-20T22:34:24Z'
updatedAt: '2025-11-19T14:02:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7206'
author: tobiu
commentsCount: 1
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Initial Dashboard Drag & Drop

## Goal
Implement the foundational (Phase 1) drag-and-drop reordering for the panels within the `Colors.view.Viewport`. This involves creating dashboard-specific sort zones and integrating them into the app.

## Tasks

1.  **Create Directory Structure:**
    -   Create the directory: `src/draggable/dashboard/`

2.  **Create `Dashboard.SortZone`:**
    -   Create a new file: `src/draggable/dashboard/SortZone.mjs`.
    -   This class will extend `Neo.draggable.container.SortZone`.

3.  **Implement Custom `onDragStart`:**
    -   Override the `onDragStart` method within the new `dashboard.SortZone`.
    -   This method must correctly identify the parent `Panel` component as the `dragElement` when a drag is initiated on a panel header.
    -   It must filter the owner's items to only include the draggable `Panel` components, ignoring static components like the main `HeaderToolbar`.

4.  **Integrate into Colors App Viewport:**
    -   Modify `apps/colors/view/Viewport.mjs` to import and instantiate the new `Neo.draggable.dashboard.SortZone`.
    -   Restructure the `items` config to wrap the `GridContainer`, `PieChartComponent`, and `BarChartComponent` in `Neo.container.Panel` instances.
    -   Configure the panel headers with the `.neo-draggable` class to act as the drag handles.

## Acceptance Criteria
- Dragging a panel header in the Colors app initiates a drag operation for the entire panel.
- Only the three main content panels are considered sortable.
- Panels can be reordered within the viewport.
- The new order is correctly applied when the drag operation is complete.

## Timeline

- 2025-08-20T22:34:24Z @tobiu assigned to @tobiu
- 2025-08-20T22:34:26Z @tobiu added parent issue #7201
- 2025-08-20T22:34:26Z @tobiu added the `enhancement` label
- 2025-08-20T22:38:57Z @tobiu referenced in commit `981c99c` - "Initial Dashboard Drag & Drop
#7206"
- 2025-08-20T23:04:04Z @tobiu referenced in commit `f3ede15` - "Initial Dashboard Drag & Drop #7206"
- 2025-08-20T23:38:39Z @tobiu referenced in commit `a5ac272` - "Initial Dashboard Drag & Drop #7206 WIP"
- 2025-08-21T08:24:58Z @tobiu referenced in commit `95e5d1c` - "#7206 SCSS file, animated panel movements"
- 2025-08-21T08:45:36Z @tobiu referenced in commit `6e729a0` - "#7206 WIP"
- 2025-08-21T08:54:17Z @tobiu referenced in commit `5b1f960` - "#7206 WIP"
- 2025-08-21T09:09:48Z @tobiu referenced in commit `af84d7f` - "#7206 WIP"
### @github-actions - 2025-11-19T02:51:49Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-11-19T02:51:49Z @github-actions added the `stale` label
- 2025-11-19T14:02:54Z @tobiu removed the `stale` label
- 2025-11-19T14:02:54Z @tobiu added the `no auto close` label

