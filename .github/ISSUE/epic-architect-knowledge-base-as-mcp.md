# Epic: Architect AI Knowledge Base as MCP Server

GH ticket id: #7501

**Assignee:** tobiu
**Status:** In Progress

## Scope

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

### Phase 4: Bugfixes

- **Goal:** Address bugs discovered during testing.
- **Sub-Tasks:**
    - `bug-kb-healthcheck-unstructured-content.md`: Fix the healthcheck tool to return structured content matching its schema.
    - `bug-kb-query-documents-input-mismatch.md`: Fix the input parameter mismatch for the `query_documents` tool.
