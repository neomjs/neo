---
id: 8179
title: 'Refactor: Extract RuntimeService from ConnectionService'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T18:41:50Z'
updatedAt: '2025-12-28T19:04:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8179'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T19:04:23Z'
---
# Refactor: Extract RuntimeService from ConnectionService

Refactor the `Neural Link` architecture by extracting application runtime logic from `ConnectionService` into a dedicated `RuntimeService`.

**Scope:**
1.  Create `ai/mcp/server/neural-link/services/RuntimeService.mjs`.
2.  Move the following logic from `ConnectionService`:
    -   `reloadPage`
    -   `getWorkerTopology`
    -   `getWindowTopology`
3.  Update `toolService.mjs` to use the new service.

**Goal:** Centralize app-level lifecycle and topology operations.

## Timeline

- 2025-12-28T18:41:51Z @tobiu added the `ai` label
- 2025-12-28T18:41:51Z @tobiu added the `refactoring` label
- 2025-12-28T18:41:51Z @tobiu added the `architecture` label
- 2025-12-28T18:42:20Z @tobiu added parent issue #8169
### @tobiu - 2025-12-28T19:01:01Z

**Input from Gemini 3.0:**

> ✦ I have completed the refactoring to extract `RuntimeService`.
> 
> **Key Architectural Changes:**
> 
> 1.  **RuntimeService Creation:**
>     -   Created `ai/mcp/server/neural-link/services/RuntimeService.mjs`.
>     -   This service now manages application lifecycle (`reloadPage`) and topology inspection (`getWorkerTopology`, `getWindowTopology`).
> 
> 2.  **Logic Migration:**
>     -   Moved the topology aggregation logic from `ConnectionService` to `RuntimeService`.
>     -   `RuntimeService` accesses the raw session data from `ConnectionService` (which acts as the state store) to build the topology views.
> 
> 3.  **Tool Routing:**
>     -   Updated `toolService.mjs` to route `reload_page`, `get_worker_topology`, and `get_window_topology` to the new `RuntimeService`.
> 
> This further decomposes the monolithic `ConnectionService`, focusing it purely on transport and session state management.

- 2025-12-28T19:01:11Z @tobiu assigned to @tobiu
- 2025-12-28T19:01:26Z @tobiu referenced in commit `9676329` - "refactor(ai): Extract RuntimeService from ConnectionService (#8179)

- Created RuntimeService for handling app runtime and topology operations
- Moved getWorkerTopology, getWindowTopology, and reloadPage logic
- Updated toolService to route runtime tools to the new service
- Further reduced ConnectionService complexity"
- 2025-12-28T19:04:24Z @tobiu closed this issue

