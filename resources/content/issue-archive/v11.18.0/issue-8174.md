---
id: 8174
title: 'Refactor Neural Link Routing: Standardize Session vs Window ID'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T15:39:27Z'
updatedAt: '2025-12-28T17:49:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8174'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T17:49:38Z'
---
# Refactor Neural Link Routing: Standardize Session vs Window ID

The current Neural Link implementation overloads the term `windowId` to mean both "WebSocket Session ID" and "Application Window ID". This is confusing and dangerous for multi-window routing.

**Requirements:**
1.  **OpenAPI**: Rename `windowId` parameter to `sessionId` for tools that target a specific connection (e.g., `get_component_tree` targets an App Worker session).
2.  **ConnectionService**: Rename method arguments to `sessionId`.
3.  **Client**: Ensure `handleRequest` params are consistent.
4.  **Routing Logic**: Explicitly document that `sessionId` targets an App Worker.


## Timeline

- 2025-12-28T15:39:28Z @tobiu added the `ai` label
- 2025-12-28T15:39:28Z @tobiu added the `refactoring` label
- 2025-12-28T15:39:28Z @tobiu added the `architecture` label
- 2025-12-28T15:39:50Z @tobiu assigned to @tobiu
- 2025-12-28T15:40:48Z @tobiu added parent issue #8169
### @tobiu - 2025-12-28T17:49:19Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have standardized the routing terminology across the Neural Link stack.
> 
> *   **OpenAPI Spec:** Renamed `windowId` parameter to `sessionId` in all relevant endpoints (`/component/tree`, `/component/property/get`, etc.).
> *   **Server (`ConnectionService.mjs`):** Updated all service methods and the internal `#call` method to use `sessionId`.
> *   **Logic:** Explicitly distinguished between the WebSocket Session ID (targeting the App Worker) and the Application Window ID (targeting a specific browser window within that worker).

- 2025-12-28T17:49:38Z @tobiu closed this issue
- 2025-12-28T18:15:55Z @tobiu referenced in commit `21b8247` - "feat(ai): Implement Neural Link healing and standardize routing (#8169)

- Refactor API: Rename windowId to sessionId for clarity (#8174)
- Feat: Implement window connect/disconnect notifications (#8175)
- Feat: Add state rehydration on reconnect (#8176)
- Update Client to track lifecycle and sync topology
- Update ConnectionService to cache window state and serve topology instantly"

