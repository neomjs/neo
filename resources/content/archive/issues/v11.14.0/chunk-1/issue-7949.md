---
id: 7949
title: Refactor Shared Tool Validation Service for MCP Client and Server
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T13:50:46Z'
updatedAt: '2025-11-30T14:29:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7949'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T14:29:43Z'
---
# Refactor Shared Tool Validation Service for MCP Client and Server

## Context
We implemented basic client-side validation in #7946. However, the validation logic is currently fragmented. We want to unify it by moving the tool service to a shared location.

## Goal
Refactor `ai/mcp/server/toolService.mjs` to be a shared resource for both Clients and Servers.

## Requirements
1.  **Relocate File:** Move `ai/mcp/server/toolService.mjs` one folder level up (to `ai/mcp/toolService.mjs`) to allow shared access.
2.  **Add `validateToolInput()`:** Implement a shared method `validateToolInput(toolName, args, schema)` within the shared service.
3.  **Refactor Client & Server:** Update both `Neo.ai.mcp.client.Client` and the MCP Servers to import and use this shared service for validation.
4.  **Server Type Strategy:**
    *   Implement a check to determine if the connected server is one of our internal servers (GitHub, Knowledge Base, Memory Core).
    *   Ensure validation logic is applied appropriately for internal servers (using our shared logic). For external servers, we need to decide if we validate against the provided JSON schema or skip strict validation.

## Deliverables
-   Shared `ai/mcp/toolService.mjs`.
-   Updated `Client.mjs` and Server implementations.


## Timeline

- 2025-11-30T13:50:47Z @tobiu added the `enhancement` label
- 2025-11-30T13:50:47Z @tobiu added the `ai` label
- 2025-11-30T13:50:47Z @tobiu added the `refactoring` label
- 2025-11-30T13:51:10Z @tobiu assigned to @tobiu
- 2025-11-30T13:51:49Z @tobiu added parent issue #7931
- 2025-11-30T14:28:55Z @tobiu referenced in commit `4ea7395` - "Refactor Shared Tool Validation Service for MCP Client and Server #7949"
### @tobiu - 2025-11-30T14:29:07Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully completed the refactoring for issue #7949.
> 
> ### Achievements
> 1.  **Shared Service:** Relocated `toolService.mjs` to `ai/mcp/toolService.mjs`, making it accessible to both Server and Client components.
> 2.  **Hybrid Validation:** Implemented `validateToolInput(toolName, args, schema)` which supports:
>     *   **Internal Zod Validation:** Uses robust Zod schemas derived from `openapi.yaml` (when initialized, e.g., in Servers).
>     *   **External JSON Schema Validation:** Falls back to a lightweight JSON Schema validator (when Zod schemas are unavailable, e.g., in Clients connecting to external servers).
> 3.  **Integration:**
>     *   Updated `Neo.ai.mcp.client.Client` to use the shared `validateToolInput`.
>     *   Updated `github-workflow`, `knowledge-base`, and `memory-core` servers to use the shared service.
> 
> ### Future Work (Singleton Refactoring)
> We identified that `toolService.mjs` is currently a singleton module. This prevents a single process (like an Agent) from initializing multiple internal server contexts (Zod schemas) simultaneously.
> *   **Current Impact:** `Client.mjs` uses the JSON Schema fallback for validation, which is functional and safe.
> *   **Next Step:** A follow-up ticket will be created to refactor `toolService.mjs` into a Class-based service to support multiple instances per process, enabling Zod validation on the Client side for multiple internal servers.
> 
> I am closing this ticket as the primary goal of sharing the validation logic and structure is complete.

- 2025-11-30T14:29:44Z @tobiu closed this issue
- 2025-11-30T14:38:21Z @tobiu cross-referenced by #7950

