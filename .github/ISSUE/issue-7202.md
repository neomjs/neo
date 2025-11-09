---
id: 7202
title: 'Phase 1: Foundational Sorting'
state: OPEN
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-20T22:04:45Z'
updatedAt: '2025-08-20T22:04:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7202'
author: tobiu
commentsCount: 0
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Phase 1: Foundational Sorting

**Reported by:** @tobiu on 2025-08-20

---

**Parent Issue:** #7201 - Dashboard Drag & Drop

---

The primary goal of this phase is to implement the core reordering functionality with a standard visual proxy.

1.  **Restructure Viewport:**
    -   In `apps/colors/view/Viewport.mjs`, wrap the `GridContainer`, `PieChartComponent`, and `BarChartComponent` each within a `Neo.container.Panel`.
    -   This will provide distinct header elements to serve as drag handles.

2.  **Develop `Container.SortZone`:**
    -   Create a new, reusable `SortZone` class tailored for generic containers (e.g., `src/draggable/container/SortZone.mjs`).
    -   This class will extend `Neo.draggable.DragZone`.
    -   It will be created by refactoring the logic from the existing `Neo.draggable.toolbar.SortZone` to work with any `vbox` or `hbox` layouts. The `toolbar.SortZone` will then be updated to extend this new container-level class.

3.  **Integration:**
    -   Instantiate the new `Container.SortZone` within the `Colors.view.Viewport` to activate the drag-and-drop functionality on the new panels.
    -   The panel headers will be configured with the `.neo-draggable` class to act as the delegate target for the `SortZone`.

