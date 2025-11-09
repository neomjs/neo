---
id: 7206
title: Initial Dashboard Drag & Drop
state: OPEN
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-20T22:34:24Z'
updatedAt: '2025-08-20T22:34:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7206'
author: tobiu
commentsCount: 0
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Initial Dashboard Drag & Drop

**Reported by:** @tobiu on 2025-08-20

---

**Parent Issue:** #7201 - Dashboard Drag & Drop

---

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

