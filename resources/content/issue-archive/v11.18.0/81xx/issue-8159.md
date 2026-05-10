---
id: 8159
title: Refactor Cross-Window Drag Logic to Dashboard SortZone
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-27T14:01:00Z'
updatedAt: '2025-12-27T15:46:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8159'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8156 Implement Cross-Window Drag Coordinator'
closedAt: '2025-12-27T15:46:36Z'
---
# Refactor Cross-Window Drag Logic to Dashboard SortZone

**Objective**
Extract cross-window and dashboard-connecting drag logic from `src/draggable/container/SortZone.mjs` (the generic base class) and move it into `src/draggable/dashboard/SortZone.mjs` (the specialized subclass).

**Why?**
Connecting dashboards and handling cross-window coordination does not belong in the base container sort zone. The base class should remain focused on standard, single-window sortable container logic.

**Scope of Work**
1.  **Move `DragCoordinator` Logic:**
    *   Move `DragCoordinator` registration/unregistration.
    *   Move `DragCoordinator` event calls (`onDragMove`, `onDragEnd` hooks).
2.  **Move Remote Drag Methods:**
    *   `startRemoteDrag`
    *   `onRemoteDragMove`
    *   `onRemoteDragLeave`
    *   `onRemoteDrop`
    *   `onRemoteDropOut`
3.  **Move Window Drag Methods:**
    *   `startWindowDrag`
    *   `suspendWindowDrag`
    *   `resumeWindowDrag`
4.  **Refactor `onDragMove` / `onDragEnd`:**
    *   Override these methods in `dashboard/SortZone` to handle the cross-window specific logic (e.g., `enableProxyToPopup` checks, coordinator signaling).
    *   Clean up the base `container/SortZone` to remove these dependencies.
5.  **Verify Dashboard Container:**
    *   Ensure `src/dashboard/Container.mjs` continues to function correctly with the refactored `dashboard/SortZone`.

**Acceptance Criteria**
*   `src/draggable/container/SortZone.mjs` no longer imports or uses `DragCoordinator`.
*   `src/draggable/dashboard/SortZone.mjs` contains all the remote/window drag logic.
*   Cross-window dragging between dashboards still works (or the architecture is ready for it).


## Timeline

- 2025-12-27T14:01:02Z @tobiu added the `ai` label
- 2025-12-27T14:01:02Z @tobiu added the `refactoring` label
- 2025-12-27T14:01:02Z @tobiu added the `architecture` label
- 2025-12-27T14:01:09Z @tobiu marked this issue as blocking #8156
- 2025-12-27T14:02:12Z @tobiu assigned to @tobiu
- 2025-12-27T14:56:35Z @tobiu referenced in commit `c19446c` - "Refactor Cross-Window Drag Logic to Dashboard SortZone #8159"
### @tobiu - 2025-12-27T15:46:18Z

**Input from gemini:**

> ✦ Refactoring complete.
> - `DragCoordinator` logic moved to `dashboard/SortZone`.
> - Base `container/SortZone` cleaned up.
> - Cross-window logic separated from standard container logic.

- 2025-12-27T15:46:37Z @tobiu closed this issue
- 2025-12-27T22:46:55Z @tobiu referenced in commit `ffb4590` - "Refactor Cross-Window Drag Logic to Dashboard SortZone #8159"

