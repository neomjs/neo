---
id: 9498
title: 'Grid Multi-Body: Infinite Canvas Cross-Window Column Drag & Drop'
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T22:23:08Z'
updatedAt: '2026-03-17T18:59:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9498'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Infinite Canvas Cross-Window Column Drag & Drop

Phase 7 of the Multi-Body Epic (#9486).

This issue describes the ultimate "Killer Demo" capability: seamless cross-window Drag & Drop for individual grid columns.

**The Scenario:**
1. A user detaches the Left SubGrid into its own physical browser window (as per #9493).
2. The user initiates a drag on a column header in the *Main* window (Center SubGrid). The high-fidelity drag proxy (header + cells) is created.
3. The user drags the column *outside* the Main window bounds. The proxy seamlessly transitions into a floating OS popup window (Infinite Canvas style, like the Dashboard).
4. The user drags the floating column over the detached Left SubGrid window.
5. The proxy reintegrates into the Left SubGrid's DOM. The user can continue dragging to sort the column *within* the detached SubGrid before finally dropping it.

**Requirements:**

1. **Dashboard-Style Proxy Transitions:**
   - Integrate `DragCoordinator` logic into the Grid's `SortZone`.
   - Implement `onDragBoundaryExit`: Detect when the column proxy leaves the grid bounds and convert it into a floating popup window containing just that column.
   - Implement `onDragBoundaryEntry`: Detect when the floating column window enters the bounds of another valid Grid instance (e.g., a detached SubGrid).
   
2. **Cross-Window Handover (`suspendWindowDrag` / `resumeWindowDrag`):**
   - When entering the detached SubGrid, the OS window drag must be suspended. The floating popup closes, and the dragged column's DOM is instantaneously injected into the target SubGrid's proxy structure so the drag motion can continue unbroken.
   - The target SubGrid must take over the drag state, calculating drop indices and providing visual indicators.

3. **Data Orchestration Sync:**
   - Upon final drop in the new window, the App Worker must update the central `GridContainer`'s collections (moving the column from `centerColumns` to `lockedStartColumns`).
   - The layout engines of *both* windows must be triggered to render the final state.

## Timeline

- 2026-03-16T22:23:09Z @tobiu added the `epic` label
- 2026-03-16T22:23:09Z @tobiu added the `ai` label
- 2026-03-16T22:23:10Z @tobiu added the `architecture` label
- 2026-03-16T22:23:10Z @tobiu added the `grid` label
- 2026-03-16T22:23:19Z @tobiu added parent issue #9486
- 2026-03-17T18:59:53Z @tobiu assigned to @tobiu

