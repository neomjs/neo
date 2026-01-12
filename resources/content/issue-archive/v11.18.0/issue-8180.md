---
id: 8180
title: 'Refactor: Extract InteractionService from ConnectionService'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T18:41:57Z'
updatedAt: '2025-12-28T19:09:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8180'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T19:09:02Z'
---
# Refactor: Extract InteractionService from ConnectionService

Refactor the `Neural Link` architecture by extracting interaction inspection logic from `ConnectionService` into a dedicated `InteractionService`.

**Scope:**
1.  Create `ai/mcp/server/neural-link/services/InteractionService.mjs`.
2.  Move `getDragState` from `ConnectionService`.
3.  Prepare the service for future interaction tools (e.g., Focus, Selection, Keyboard).
4.  Update `toolService.mjs` to use the new service.

**Goal:** Provide a dedicated home for tools that inspect transient user interaction states.

## Timeline

- 2025-12-28T18:41:58Z @tobiu added the `ai` label
- 2025-12-28T18:41:59Z @tobiu added the `refactoring` label
- 2025-12-28T18:41:59Z @tobiu added the `architecture` label
- 2025-12-28T18:42:22Z @tobiu added parent issue #8169
- 2025-12-28T19:05:20Z @tobiu assigned to @tobiu
- 2025-12-28T19:08:28Z @tobiu referenced in commit `0c25505` - "refactor(ai): Extract InteractionService from ConnectionService (#8180)

- Created InteractionService for handling interaction inspection (Drag & Drop)
- Moved getDragState logic
- Updated toolService to route interaction tools to the new service
- ConnectionService is now purely transport and session management"
### @tobiu - 2025-12-28T19:08:33Z

**Input from Gemini 3.0:**

> ✦ I have completed the refactoring to extract `InteractionService`.
> 
> **Key Architectural Changes:**
> 
> 1.  **InteractionService Creation:**
>     -   Created `ai/mcp/server/neural-link/services/InteractionService.mjs`.
>     -   This service currently handles `getDragState`, but is the designated home for future interaction tools (Focus, Selection, Keyboard).
> 
> 2.  **Logic Migration:**
>     -   Moved `getDragState` from `ConnectionService` to `InteractionService`.
> 
> 3.  **Tool Routing:**
>     -   Updated `toolService.mjs` to route `get_drag_state` to the new `InteractionService`.
> 
> The service extraction phase of the Neural Link hardening is now complete. `ConnectionService` has been successfully decomposed.

- 2025-12-28T19:09:02Z @tobiu closed this issue

