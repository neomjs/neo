---
id: 8184
title: 'Feat: Neural Link - Navigation Control & History'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T20:58:50Z'
updatedAt: '2025-12-28T20:58:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8184'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Navigation Control & History

**Context:**
Navigation is the primary way to change application state. Agents need to read the current route, understand the navigation history, and drive the application to specific views.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `getRouteHistory(sessionId)`: Retrieves history from `Neo.util.HashHistory` (singleton in App Worker).
    -   Add `setRoute(sessionId, hash)`: Calls `Neo.Main.setRoute({hash, windowId})` (Remote method).

2.  **Tools:**
    -   `get_route_history`: Returns the history stack and current index.
    -   `set_route`: Accepts `hash` and optional `windowId` (defaults to sessionId's main window).

**Goal:** Enable agents to navigate and understand the navigation context.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

