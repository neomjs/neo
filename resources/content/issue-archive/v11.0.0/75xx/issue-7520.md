---
id: 7520
title: 'Epic: Migrate Memory Server to stdio-based MCP'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T11:22:02Z'
updatedAt: '2025-10-17T12:44:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7520'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7521 Scaffold Memory Core MCP Server'
  - '[x] 7522 Refactor Memory Core OpenAPI for MCP'
  - '[x] 7523 Implement Memory Core toolService'
  - '[x] 7524 Remove Legacy Express Server from Memory Core'
  - '[x] 7525 Enhance Memory Core Health Check'
  - '[x] 7526 Refactor dbService to use chromaManager'
  - '[x] 7527 Refactor Health Service to Remove Redundant Try/Catch'
  - '[x] 7528 Use Centralized AI Config in Memory Core Services'
subIssuesCompleted: 8
subIssuesTotal: 8
blockedBy: []
blocking: []
closedAt: '2025-10-17T12:44:19Z'
---
# Epic: Migrate Memory Server to stdio-based MCP

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

## Timeline

- 2025-10-17T11:22:02Z @tobiu assigned to @tobiu
- 2025-10-17T11:22:03Z @tobiu added the `epic` label
- 2025-10-17T11:22:03Z @tobiu added the `ai` label
- 2025-10-17T11:23:49Z @tobiu added sub-issue #7521
- 2025-10-17T11:24:52Z @tobiu added sub-issue #7522
- 2025-10-17T11:25:47Z @tobiu added sub-issue #7523
- 2025-10-17T11:26:44Z @tobiu added sub-issue #7524
- 2025-10-17T11:27:11Z @tobiu referenced in commit `76835af` - "#7520 tickets as md files"
- 2025-10-17T12:06:15Z @tobiu added sub-issue #7525
- 2025-10-17T12:14:08Z @tobiu added sub-issue #7526
- 2025-10-17T12:19:45Z @tobiu added sub-issue #7527
- 2025-10-17T12:24:37Z @tobiu added sub-issue #7528
### @tobiu - 2025-10-17T12:44:19Z

resolved.

- 2025-10-17T12:44:19Z @tobiu closed this issue

