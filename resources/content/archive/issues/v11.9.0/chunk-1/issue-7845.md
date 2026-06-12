---
id: 7845
title: 'Feat: Create Neo.manager.Window for Multi-Window Geometry Tracking'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T18:16:41Z'
updatedAt: '2025-11-21T20:54:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7845'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T20:54:34Z'
---
# Feat: Create Neo.manager.Window for Multi-Window Geometry Tracking

## Goal
Create a new core manager, `Neo.manager.Window`, in the App Worker to track the geometry and state of all connected browser windows. This is the foundational "God View" required for cross-window interactions like drag-and-drop.

## Responsibilities
1.  **Registry:** Maintain a collection of all connected windows, keyed by `windowId`.
2.  **Geometry Tracking:** Store the `screenX`, `screenY`, `outerWidth`, and `outerHeight` for each window.
3.  **Updates:** Provide a method (e.g., `updateWindowRect(windowId, rect)`) that can be called by the Main Thread (via DOM listeners or polling) to keep the worker state in sync.
4.  **Intersection API:** Provide a method `getWindowAt(screenX, screenY)` that returns the `windowId` of the window at the given global coordinates.

## Implementation Details
-   **Namespace:** `src/manager/Window.mjs`
-   **Singleton:** This should be a global singleton in the App Worker.
-   **Integration:** It should listen for `connect` / `disconnect` events to manage the registry automatically.

## Acceptance Criteria
-   `Neo.manager.Window` exists and is accessible in the App Worker.
-   It correctly tracks the list of active windows.
-   (Mock/Test) Updating a window's rect updates the internal state.
-   `getWindowAt(x, y)` correctly identifies the target window based on the stored geometry.

## Timeline

- 2025-11-21T18:16:43Z @tobiu added the `enhancement` label
- 2025-11-21T18:16:43Z @tobiu added the `ai` label
- 2025-11-21T18:18:21Z @tobiu assigned to @tobiu
- 2025-11-21T20:53:09Z @tobiu referenced in commit `14b20c1` - "Feat: Create Neo.manager.Window for Multi-Window Geometry Tracking #7845"
- 2025-11-21T20:54:34Z @tobiu closed this issue

