---
id: 7950
title: Refactor ToolService to Class-based Architecture
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-30T14:38:20Z'
updatedAt: '2025-11-30T14:38:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7950'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2025-11-30 @tobiu added the `enhancement` label
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added the `refactoring` label
- 2025-11-30 @tobiu added parent issue #7931

