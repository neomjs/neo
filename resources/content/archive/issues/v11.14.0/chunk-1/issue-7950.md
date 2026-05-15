---
id: 7950
title: Refactor ToolService to Class-based Architecture
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T14:38:20Z'
updatedAt: '2025-11-30T15:10:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7950'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T15:10:43Z'
---
# Refactor ToolService to Class-based Architecture

## Context
In #7949, we moved `toolService.mjs` to a shared location to support client-side validation. However, the service remains a singleton module with module-level state (`toolMapping`). This prevents a single process (like an Agent) from initializing multiple internal server contexts (Zod schemas) simultaneously, as subsequent initializations overwrite the global state.

## Goal
Refactor `ai/mcp/toolService.mjs` into a class-based `Neo.ai.mcp.ToolService` extending `Neo.core.Base`. This allows each Server or Client connection to maintain its own independent tool registry and validation context.

## Requirements
1.  **Rename & Refactor:** Rename `ai/mcp/toolService.mjs` to `ai/mcp/ToolService.mjs`. Convert it to export a `ToolService` class extending `Neo.core.Base`.
2.  **Configuration:**
    *   `openApiFilePath`: Define as a non-reactive config (no trailing underscore) to allow prototype or instance-level overrides.
3.  **Class Fields:**
    *   `serviceMapping`: Define as a class field.
    *   `toolMapping` & `allToolsForListing`: Define as instance properties (lazy-loaded state).
4.  **Server Update:** Update all MCP Servers (`github-workflow`, `knowledge-base`, `memory-core`) to instantiate `new ToolService({ serviceMapping, openApiFilePath })` (or similar config pattern) in their local service wrappers.
5.  **Client Update:** Update `Neo.ai.mcp.client.Client` to:
    *   Instantiate a `ToolService` for each connection.
    *   Pass the `openApiFilePath` (retrieved from config) to the `ToolService` if available, enabling robust Zod validation for internal servers.

## Deliverables
-   `ai/mcp/ToolService.mjs` (Class-based).
-   Updated Servers and Client using the new class.


## Timeline

- 2025-11-30T14:38:21Z @tobiu added the `enhancement` label
- 2025-11-30T14:38:21Z @tobiu added the `ai` label
- 2025-11-30T14:38:21Z @tobiu added the `refactoring` label
- 2025-11-30T14:38:29Z @tobiu added parent issue #7931
- 2025-11-30T14:38:44Z @tobiu assigned to @tobiu
- 2025-11-30T15:10:15Z @tobiu referenced in commit `7284f44` - "Refactor ToolService to Class-based Architecture #7950"
### @tobiu - 2025-11-30T15:10:18Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully completed the singleton-to-class refactoring for `ToolService`.
> 
> ### Refactoring Details
> 1.  **Class Architecture:** `ai/mcp/ToolService.mjs` is now a class extending `Neo.core.Base`.
>     *   State (`toolMapping`, `allToolsForListing`) is instance-scoped.
>     *   Configuration (`openApiFilePath`) is handled via `static config` and `construct`.
> 2.  **Server Migration:** All three MCP servers (`github-workflow`, `knowledge-base`, `memory-core`) now instantiate a `new ToolService(...)` in their respective `services/toolService.mjs` wrappers, ensuring isolation.
> 3.  **Client Migration:** `Neo.ai.mcp.client.Client` now creates a private `ToolService` instance for *each* connection (`initAsync`). This enables the Client to maintain separate validation contexts (e.g., separate Zod schemas) for different internal servers within the same process.
> 
> ### Verification
> The `mcp-demo-agent.mjs` runs successfully, confirming that:
> -   Servers initialize correctly with the new class-based service.
> -   The Client connects and executes tools (using the new class-based validation logic).
> -   The architecture handles the multi-server setup without state pollution.
> 
> I am ready to close this ticket.

- 2025-11-30T15:10:43Z @tobiu closed this issue

