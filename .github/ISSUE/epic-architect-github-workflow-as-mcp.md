# Epic: Architect GitHub Workflow as MCP Server

GH ticket id: #7378

**Assignee:** tobiu
**Status:** To Do

## Scope

This epic is a high-priority follow-up to [Epic: Integrate GitHub CLI to Streamline Contribution Workflow (#7364)](https://github.com/neomjs/neo/issues/7364). It addresses our primary internal bottleneck by migrating the script-based `gh` integrations into a robust, professional-grade Model Context Protocol (MCP) server.

The primary goal is to create a persistent, stateful server that provides a formal API for all GitHub interactions. This moves us away from ad-hoc scripts and toward the professionalized AI tooling outlined in the project [ROADMAP.md](ROADMAP.md).

## Priority & Methodology

This is a critical-path initiative for the core team (Tobi & Gemini duo). It is **not** a candidate for Hacktoberfest or external contribution.

We will employ a rapid and agile development approach. The scope and API specification are expected to evolve as we build and test the server. This flexibility is key to quickly delivering a solution that effectively unblocks our PR review and issue management workflows.

## Top-Level Items

### Phase 1: Scaffolding & Core API Definition

- **Goal:** Establish the server's foundation and define the initial API for PR interactions.
- **Sub-Tasks:**
    - `ticket-define-initial-openapi-spec.md`: Create and refine an `openapi.yaml` specification, focusing first on health checks and core PR operations (list, checkout, diff).
    - `ticket-scaffold-github-workflow-server.md`: Scaffold the server structure, including directories, core files, and middleware, mirroring the memory server.
    - `ticket-refine-healthcheck-for-github-workflow-server.md`: Implement a robust health check to verify `gh` installation, authentication, and version.

### Phase 2: API Implementation

- **Goal:** Build out the backend logic to connect the OpenAPI endpoints to live `gh` commands.
- **Sub-Tasks:**
    - `ticket-implement-pull-request-api-endpoints.md`: Implement the core `pull-requests` endpoints (list, checkout, diff).
    - `ticket-enhance-pr-listing-and-checkout.md`: Add state filtering to the PR list endpoint and improve the checkout response.
    - `ticket-implement-pr-comment-endpoint.md`: Implement an endpoint to allow commenting on pull requests.
    - `ticket-get-pr-conversation-history.md`: Implement an endpoint to retrieve the full conversation history for a PR.
    - `ticket-manage-repository-labels.md`: Implement endpoints for listing and managing repository labels.

### Phase 3: MCP Refactoring
- **Goal:** Evolve the server from a REST API to a true MCP tool-providing server.
- **Sub-Tasks:**
    - `ticket-refactor-to-mcp-tool-server.md`: Implement `tools/list` and `tools/call` endpoints to dynamically expose the server's capabilities.
    - `ticket-enhance-tools-list-with-schema.md`: Enhance the `/tools/list` endpoint to include OpenAPI schema definitions for each tool's parameters and responses.
    - `ticket-implement-mcp-stdio-server.md`: Implement a proper MCP-compliant server using a `stdio` transport.
    - `ticket-refactor-to-direct-mcp-tool-definitions.md`: Refactor to define tools directly in code, removing the OpenAPI dependency.
    - `ticket-implement-dynamic-tool-discovery.md`: Implement dynamic tool discovery via OpenAPI.
    - `ticket-implement-mcp-input-validation.md`: Implement Input Schema Validation for MCP Tool Calls.
    - `ticket-add-mcp-output-schema.md`: Add outputSchema to MCP Tool Definitions.
    - `ticket-add-mcp-tool-annotations.md`: Add Annotations to MCP Tool Definitions.
### Future Scope
- Implementation of the API endpoints.
- Integration of ticket and issue synchronization.
- Refactoring the agent to use the new server.
