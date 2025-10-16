# Epic: Architect AI Knowledge Base as MCP Server

GH ticket id: #7501

**Assignee:** tobiu
**Status:** To Do

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
