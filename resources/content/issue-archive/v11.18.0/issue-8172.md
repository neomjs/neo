---
id: 8172
title: Implement Neural Link Drag & Drop Inspection
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T13:37:52Z'
updatedAt: '2025-12-28T17:17:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8172'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T17:17:33Z'
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


## Timeline

- 2025-12-28T13:37:54Z @tobiu added the `enhancement` label
- 2025-12-28T13:37:54Z @tobiu added the `ai` label
- 2025-12-28T13:38:06Z @tobiu added parent issue #8169
- 2025-12-28T17:16:05Z @tobiu assigned to @tobiu
- 2025-12-28T17:16:29Z @tobiu referenced in commit `f09dcb6` - "Implement Neural Link Drag & Drop Inspection #8172"
### @tobiu - 2025-12-28T17:17:11Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have implemented the Drag & Drop inspection tool for the Neural Link.
> 
> **Changes:**
> 1.  **OpenAPI & Tools (`openapi.yaml`, `toolService.mjs`)**:
>     *   Added `/drag/state` endpoint (`get_drag_state`).
>     *   Used `sessionId` as the target parameter, aligning with the new routing standard.
> 2.  **Server (`ConnectionService.mjs`)**:
>     *   Implemented `getDragState` routing.
> 3.  **Client (`src/ai/Client.mjs`)**:
>     *   Implemented `get_drag_state` handler.
>     *   **Logic:** Queries `Neo.manager.DragCoordinator` (if available) to retrieve:
>         *   `activeTargetZone`: The remote zone currently receiving the drag (with `windowId` and `sortGroup`).
>         *   `sortZones`: A flattened list of all registered sort zones across all windows, grouped by `sortGroup`.
> 
> **Verification:**
> *   Verified static analysis of `Client.mjs` logic.
> *   Verified server startup.
> 
> Ready for review.

- 2025-12-28T17:17:33Z @tobiu closed this issue

