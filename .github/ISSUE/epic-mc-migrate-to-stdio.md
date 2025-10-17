---
title: "Epic: Migrate Memory Server to stdio-based MCP"
labels: epic, enhancement, AI
---

GH ticket id: #7520

**Assignee:** tobiu
**Status:** To Do

## Scope

This epic covers the migration of the Express-based `memory` server to a `stdio`-only MCP server, aligning its architecture with the other MCP servers. The core tasks are to refactor the existing `openapi.yaml` for MCP tool compatibility, scaffold the new `stdio` entry point, and wire it up to the existing, well-structured services.

## Top-Level Items

### Phase 1: Scaffolding & API Refactoring

- **Goal:** Prepare the new server structure and refactor the API definition for MCP compatibility.
- **Sub-Tasks:**
    - `ticket-mc-scaffold-server.md`: Scaffold the new `memory-core` server structure.
    - `ticket-mc-refactor-openapi.md`: Refactor the existing `openapi.yaml` to use a flat structure with `operationId` for each tool.

### Phase 2: Implementation

- **Goal:** Implement the new `stdio`-based server and refactor for consistency.
- **Sub-Tasks:**
    - `ticket-mc-implement-tool-service.md`: Implement the local `toolService.mjs` to connect OpenAPI `operationId`s to existing service functions.
    - `ticket-mc-enhance-healthcheck.md`: Enhance the `healthcheck` tool to provide detailed collection status.
    - `ticket-mc-refactor-dbservice.md`: Refactor `dbService` to use the shared `chromaManager`.
    - `ticket-mc-use-central-config.md`: Update all services to use the centralized `aiConfig`.
    - `ticket-mc-refactor-healthservice-try-catch.md`: Refactor `healthService` to remove redundant `try...catch` blocks.

### Phase 3: Cleanup

- **Goal:** Deprecate and remove the old Express server.
- **Sub-Tasks:**
    - `ticket-mc-remove-express.md`: Remove the old `index.mjs` and any Express-related files and dependencies.
