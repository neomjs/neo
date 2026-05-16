---
id: 7202
title: 'Phase 1: Foundational Sorting'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-08-20T22:04:45Z'
updatedAt: '2025-11-19T14:01:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7202'
author: tobiu
commentsCount: 1
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Phase 1: Foundational Sorting

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

## Timeline

- 2025-08-20T22:04:45Z @tobiu assigned to @tobiu
- 2025-08-20T22:04:46Z @tobiu added parent issue #7201
- 2025-08-20T22:04:47Z @tobiu added the `enhancement` label
- 2025-08-20T22:09:25Z @tobiu referenced in commit `f9a9947` - "#7202 draggable.container.DragZone, draggable.container.SortZone"
- 2025-08-20T22:27:55Z @tobiu referenced in commit `81579aa` - "#7202 Colors.view.Viewport: using 3 panels as wrappers (drag handles)"
### @github-actions - 2025-11-19T02:51:53Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-11-19T02:51:53Z @github-actions added the `stale` label
- 2025-11-19T14:01:32Z @tobiu removed the `stale` label
- 2025-11-19T14:01:32Z @tobiu added the `no auto close` label

