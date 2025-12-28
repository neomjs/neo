---
id: 8161
title: Refine Cross-Window Drag Intersection to Target SortZone Rect
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-27T21:06:24Z'
updatedAt: '2025-12-27T23:53:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8161'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refine Cross-Window Drag Intersection to Target SortZone Rect

Currently, `DragCoordinator` triggers a remote drag operation as soon as the mouse enters a target *window* that has a registered SortZone. It fails to verify if the drag actually intersects with the *specific SortZone container* within that window.

**Current Behavior:**
1. `Window.getWindowAt(screenX, screenY)` identifies the target window.
2. `DragCoordinator` checks if this window is in the registry.
3. If yes, it immediately delegates to `targetSortZone.onRemoteDragMove`.

**Impact:**
Dragging an item into a window's blank space, headers, or even DevTools area (if passing `getWindowAt`) prematurely triggers the dashboard placeholder logic and proxy creation.

**Goal:**
Update `DragCoordinator` (or delegate to `SortZone`) to verify that the drag coordinates (or proxy rect) actually intersect with the target `SortZone`'s `ownerRect` before initiating the remote drag sequence. This ensures the "drop target" effect only activates when visually appropriate.

## Activity Log

- 2025-12-27 @tobiu added the `enhancement` label
- 2025-12-27 @tobiu added the `ai` label
- 2025-12-27 @tobiu added parent issue #8163
- 2025-12-27 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu referenced in commit `711a59b` - "Neo.manager.DragCoordinator: Refactor onDragMove for clarity and efficient early returns - #8161"

