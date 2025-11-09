---
id: 7477
title: Architect GitHub Workflow as MCP Server
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T08:37:49Z'
updatedAt: '2025-10-20T10:56:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7477'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - 7478
  - 7479
  - 7480
  - 7481
  - 7482
  - 7483
  - 7484
  - 7485
  - 7486
  - 7487
  - 7491
  - 7492
  - 7493
  - 7494
  - 7495
  - 7496
  - 7497
  - 7498
  - 7499
  - 7500
subIssuesCompleted: 20
subIssuesTotal: 20
closedAt: '2025-10-20T10:56:45Z'
---
# Architect GitHub Workflow as MCP Server

**Reported by:** @tobiu on 2025-10-14

---

**Sub-Issues:** #7478, #7479, #7480, #7481, #7482, #7483, #7484, #7485, #7486, #7487, #7491, #7492, #7493, #7494, #7495, #7496, #7497, #7498, #7499, #7500
**Progress:** 20/20 completed (100%)

---

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
    - `ticket-implement-zod-validation.md`: Implement Zod-based Validation with JSON Schema Conversion.
    - `ticket-add-mcp-output-schema.md`: Add outputSchema to MCP Tool Definitions.
    - `ticket-add-mcp-tool-annotations.md`: Add Annotations to MCP Tool Definitions.
    - `ticket-refine-mcp-stdio.md`: Refine `mcp-stdio.mjs` for MCP Compliance and Clarity.
    - `ticket-fix-gemini-cli-mcp-compatibility.md`: Fix Gemini CLI Client Compatibility for MCP `tools/list` Response.
    - `ticket-implement-conditional-omission.md`: Implement Conditional Omission of Optional Fields in MCP Tool Definitions.
    - `ticket-simplify-description-handling.md`: Simplify Description Handling in Zod Schema Generation.

### Future Scope
- Integration of ticket and issue synchronization.

## Comments

### @tobiu - 2025-10-15 11:40

closed the epic by accident. not done yet.

### @tobiu - 2025-10-20 10:56

resolved. i will create more epics for specific enhancements.

