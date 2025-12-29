---
id: 7501
title: Architect AI Knowledge Base as MCP Server
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T09:45:24Z'
updatedAt: '2025-10-17T11:01:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7501'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7502'
  - '[x] 7503'
  - '[x] 7504'
  - '[x] 7505'
  - '[x] 7506'
  - '[x] 7507'
  - '[x] 7508'
  - '[x] 7509'
  - '[x] 7510'
  - '[x] 7511'
  - '[x] 7512'
  - '[x] 7513'
  - '[x] 7514'
  - '[x] 7515'
  - '[x] 7516'
  - '[x] 7517'
  - '[x] 7518'
  - '[x] 7519'
subIssuesCompleted: 18
subIssuesTotal: 18
blockedBy: []
blocking: []
closedAt: '2025-10-17T11:01:49Z'
---
# Architect AI Knowledge Base as MCP Server

This epic addresses the need to migrate our script-based AI knowledge base tools (`buildScripts/ai/*.mjs`) into a robust, professional-grade Model Context Protocol (MCP) server.

The primary goal is to create a persistent, stateful server that provides a formal API for all knowledge base interactions (building, embedding, and querying). This moves us away from ad-hoc scripts and toward the professionalized AI tooling outlined in the project [ROADMAP.md](ROADMAP.md).

## Priority & Methodology

This is a critical-path initiative for the core team (Tobi & Gemini duo). It is **not** a candidate for Hacktoberfest or external contribution.

We will employ a rapid and agile development approach. The scope and API specification are expected to evolve as we build and test the server. This flexibility is key to quickly delivering a solution that effectively unblocks our ability to provide AI agents with deep project context.

## Top-Level Items

### Phase 1: Scaffolding & Core API Definition

- **Goal:** Establish the server's foundation and define the initial API for knowledge base interactions.
- **Sub-Tasks:**
    - `ticket-kb-design-api.md`: Design the comprehensive API for the Knowledge Base MCP Server.
    - `ticket-kb-scaffold-server.md`: Scaffold the server structure based on the `mcp-stdio.mjs` pattern.

### Phase 2: API Implementation

- **Goal:** Build out the backend logic to connect the OpenAPI endpoints to live service functions.
- **Sub-Tasks:**
    - `ticket-kb-implement-tool-service.md`: Implement the core tool service to dynamically load tools from the OpenAPI spec.
    - `ticket-kb-implement-healthcheck-service.md`: Implement the healthcheck service to verify the connection to ChromaDB.  
    - `ticket-kb-implement-delete-db-service.md`: Implement the service to delete the ChromaDB collection.
    - `ticket-kb-implement-query-service.md`: Implement the service to query documents from the knowledge base.
    - `ticket-kb-implement-sync-service.md`: Implement the service to build and embed the knowledge base content.
    - `ticket-kb-implement-document-services.md`: Implement services to list and retrieve individual documents.

### Phase 3: Refactoring & Cleanup

- **Goal:** Improve the modularity and maintainability of the server code.
- **Sub-Tasks:**
    - `ticket-kb-refactor-config.md`: Decouple the server from the shared `buildScripts` configuration.
    - `ticket-kb-separate-create-embed.md`: Separate the monolithic sync service into distinct `create` and `embed` tools.
    - `ticket-kb-review-and-correct-database-service.md`: Review and correct the `databaseService` implementation to ensure full feature parity.
    - `ticket-kb-enhance-openapi-examples.md`: Enhance the OpenAPI spec with tool usage examples from AGENTS.md.
    - `ticket-kb-enhance-tool-manuals.md`: Expand tool descriptions into comprehensive in-spec manuals.
    - `ticket-kb-refactor-tool-service.md`: Refactor `toolService.mjs` to reduce code duplication.
    - `ticket-kb-resilient-tool-service.md`: Make `toolService` resilient to server-prefixed tool names.
    - `ticket-kb-openapi-driven-args.md`: Dynamically determine argument passing strategy from OpenAPI spec.

### Phase 4: Bugfixes

- **Goal:** Address bugs discovered during testing.
- **Sub-Tasks:**
    - `bug-kb-healthcheck-unstructured-content.md`: Fix the healthcheck tool to return structured content matching its schema.
    - `bug-kb-query-documents-input-mismatch.md`: Fix the input parameter mismatch for the `query_documents` tool.

## Comments

### @tobiu - 2025-10-17 11:01

<img width="823" height="1088" alt="Image" src="https://github.com/user-attachments/assets/0092fcf8-7762-4069-a594-10f2ce3cf554" />

## Activity Log

- 2025-10-16 @tobiu assigned to @tobiu
- 2025-10-16 @tobiu added the `epic` label
- 2025-10-16 @tobiu added the `ai` label
- 2025-10-16 @tobiu added sub-issue #7502
- 2025-10-16 @tobiu added sub-issue #7503
- 2025-10-16 @tobiu referenced in commit `60ba111` - "#7501 epic as md file"
- 2025-10-16 @tobiu added sub-issue #7504
- 2025-10-16 @tobiu added sub-issue #7505
- 2025-10-16 @tobiu added sub-issue #7506
- 2025-10-16 @tobiu added sub-issue #7507
- 2025-10-16 @tobiu added sub-issue #7508
- 2025-10-16 @tobiu added sub-issue #7509
- 2025-10-16 @tobiu added sub-issue #7510
- 2025-10-16 @tobiu added sub-issue #7511
- 2025-10-16 @tobiu added sub-issue #7512
- 2025-10-16 @tobiu added sub-issue #7513
- 2025-10-16 @tobiu added sub-issue #7514
- 2025-10-16 @tobiu added sub-issue #7515
- 2025-10-16 @tobiu added sub-issue #7516
- 2025-10-17 @tobiu added sub-issue #7517
- 2025-10-17 @tobiu added sub-issue #7518
- 2025-10-17 @tobiu added sub-issue #7519
- 2025-10-17 @tobiu closed this issue

