---
id: 8172
title: Implement Neural Link Drag & Drop Inspection
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T13:37:52Z'
updatedAt: '2025-12-28T13:37:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8172'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Neural Link Drag & Drop Inspection

Create a specialized tool to expose the internal state of the `Neo.manager.DragCoordinator`.

**Tool: `get_drag_state()`**
-   **Goal:** meaningful debug info for "Infinite Canvas" scenarios.
-   **Return Data:**
    -   `isDragging`: Boolean
    -   `dragProxy`: ID and WindowID of the current proxy.
    -   `source`: ID and WindowID of the source component.
    -   `activeMonitors`: List of active drop zones and their coordinates.
    -   `currentWindow`: The windowId where the mouse currently is.


## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

