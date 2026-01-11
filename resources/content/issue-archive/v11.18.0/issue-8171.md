---
id: 8171
title: Implement Neural Link Window Topology Discovery
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T13:37:31Z'
updatedAt: '2025-12-28T15:31:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8171'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T15:31:05Z'
---
# Implement Neural Link Window Topology Discovery

Create a tool to discover and describe the multi-window topology of the running application.

**Tool: `get_window_topology()`**
-   **Returns:** A list of active connected windows.
-   **Metadata per Window:**
    -   `windowId` (The Neo.mjs internal ID)
    -   `appName` (The running App name)
    -   `url` (Full URL including query parameters)
    -   `screenPosition` ({top, left, width, height} - vital for debugging drag offsets)
    -   `role` (Main vs Popup - inferred from URL or app state)


## Timeline

- 2025-12-28T13:37:32Z @tobiu added the `enhancement` label
- 2025-12-28T13:37:32Z @tobiu added the `ai` label
- 2025-12-28T13:37:39Z @tobiu added parent issue #8169
- 2025-12-28T15:29:06Z @tobiu referenced in commit `58c6e6f` - "#8171 and #8173 in combination"
### @tobiu - 2025-12-28T15:29:55Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have implemented the Window Topology discovery mechanism, leveraging the `Neo.manager.Window` "God View" in the App Worker.
> 
> **Changes:**
> 1.  **Server (`ConnectionService.mjs`)**:
>     *   Implemented `getWindowTopology`.
>     *   **Logic:** Iterates all connected App Worker sessions, calls `get_window_info` on each, and aggregates the results.
>     *   **Deduplication:** Filters results by `window.id` (Application Window ID) to ensure a clean list even if multiple workers report the same window (e.g. SharedWorkers).
> 2.  **Client (`src/ai/Client.mjs`)**:
>     *   Implemented `get_window_info` handler.
>     *   **Logic:** Queries `Neo.manager.Window.items` to retrieve the geometric state (`innerRect`, `outerRect`, `chrome`) of all windows managed by that worker.
> 3.  **OpenAPI & Tools**:
>     *   Added `/window/topology` endpoint with full schema (including `chrome` metrics).
>     *   Mapped `get_window_topology` in `toolService.mjs`.
> 
> **Result:**
> The AI Agent can now discover the full multi-window layout of the application, including popup windows and their exact screen coordinates, which is critical for debugging drag-and-drop.
> 
> Ready for review.

- 2025-12-28T15:30:27Z @tobiu assigned to @tobiu
- 2025-12-28T15:31:05Z @tobiu closed this issue

