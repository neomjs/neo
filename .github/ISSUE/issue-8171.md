---
id: 8171
title: Implement Neural Link Window Topology Discovery
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T13:37:31Z'
updatedAt: '2025-12-28T13:37:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8171'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

