---
id: 8174
title: 'Refactor Neural Link Routing: Standardize Session vs Window ID'
state: OPEN
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T15:39:27Z'
updatedAt: '2025-12-28T15:39:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8174'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Neural Link Routing: Standardize Session vs Window ID

The current Neural Link implementation overloads the term `windowId` to mean both "WebSocket Session ID" and "Application Window ID". This is confusing and dangerous for multi-window routing.

**Requirements:**
1.  **OpenAPI**: Rename `windowId` parameter to `sessionId` for tools that target a specific connection (e.g., `get_component_tree` targets an App Worker session).
2.  **ConnectionService**: Rename method arguments to `sessionId`.
3.  **Client**: Ensure `handleRequest` params are consistent.
4.  **Routing Logic**: Explicitly document that `sessionId` targets an App Worker.


## Activity Log

- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `refactoring` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu added parent issue #8169

