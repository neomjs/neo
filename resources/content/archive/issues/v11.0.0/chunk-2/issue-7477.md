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
  - '[x] 7478 Define Initial OpenAPI Specification for GitHub Workflow Server'
  - '[x] 7479 Scaffold GitHub Workflow MCP Server'
  - '[x] 7480 Refine Health Check for GitHub Workflow Server'
  - '[x] 7481 Implement Pull Request API Endpoints'
  - '[x] 7482 Enhance PR Listing and Checkout Logic'
  - '[x] 7483 Implement PR Commenting Endpoint'
  - '[x] 7484 Get PR Conversation History'
  - '[x] 7485 Manage Repository Labels'
  - '[x] 7486 Refactor to an MCP Tool-Providing Server'
  - '[x] 7487 Enhance Tools List with OpenAPI Schema'
  - '[x] 7491 Implement MCP Stdio Server for GitHub Workflow'
  - '[x] 7492 Refactor to Direct MCP Tool Definitions'
  - '[x] 7493 Implement Dynamic Tool Discovery via OpenAPI'
  - '[x] 7494 Implement Zod-based Validation with JSON Schema Conversion'
  - '[x] 7495 Add outputSchema to MCP Tool Definitions'
  - '[x] 7496 Add Annotations to MCP Tool Definitions'
  - '[x] 7497 Refine `mcp-stdio.mjs` for MCP Compliance and Clarity'
  - '[x] 7498 Fix Gemini CLI Client Compatibility for MCP `tools/list` Response'
  - '[x] 7499 Implement Conditional Omission of Optional Fields in MCP Tool Definitions'
  - '[x] 7500 Simplify Description Handling in Zod Schema Generation'
subIssuesCompleted: 20
subIssuesTotal: 20
blockedBy: []
blocking: []
closedAt: '2025-10-20T10:56:45Z'
---
# Architect GitHub Workflow as MCP Server

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

## Timeline

- 2025-10-14T08:37:49Z @tobiu assigned to @tobiu
- 2025-10-14T08:37:51Z @tobiu added the `epic` label
- 2025-10-14T08:37:51Z @tobiu added the `ai` label
- 2025-10-14T08:40:13Z @tobiu added sub-issue #7478
- 2025-10-14T08:58:32Z @tobiu added sub-issue #7479
- 2025-10-14T09:12:35Z @tobiu added sub-issue #7480
- 2025-10-14T09:22:00Z @tobiu added sub-issue #7481
- 2025-10-14T09:37:18Z @tobiu added sub-issue #7482
- 2025-10-14T10:48:01Z @tobiu added sub-issue #7483
- 2025-10-14T10:56:49Z @tobiu added sub-issue #7484
- 2025-10-14T11:24:00Z @tobiu added sub-issue #7485
- 2025-10-14T11:49:30Z @tobiu added sub-issue #7486
- 2025-10-14T12:23:59Z @tobiu added sub-issue #7487
- 2025-10-14T15:02:51Z @tobiu cross-referenced by #7403
- 2025-10-15T10:12:52Z @tobiu added sub-issue #7491
- 2025-10-15T10:29:38Z @tobiu added sub-issue #7492
- 2025-10-15T10:35:43Z @tobiu closed this issue
- 2025-10-15T10:44:04Z @tobiu added sub-issue #7493
- 2025-10-15T11:37:47Z @tobiu cross-referenced by PR #7490
### @tobiu - 2025-10-15T11:40:36Z

closed the epic by accident. not done yet.

- 2025-10-15T11:40:36Z @tobiu reopened this issue
- 2025-10-15T11:43:13Z @tobiu added sub-issue #7494
- 2025-10-15T11:44:19Z @tobiu added sub-issue #7495
- 2025-10-15T11:45:11Z @tobiu added sub-issue #7496
- 2025-10-15T12:13:32Z @tobiu added sub-issue #7497
- 2025-10-15T12:17:52Z @tobiu referenced in commit `af7afb2` - "#7477 toolService.mjs: intent-driven comments"
- 2025-10-15T13:41:06Z @tobiu added sub-issue #7498
- 2025-10-15T13:55:23Z @tobiu added sub-issue #7499
- 2025-10-15T14:07:10Z @tobiu added sub-issue #7500
- 2025-10-15T14:12:42Z @tobiu referenced in commit `75979a4` - "#7477 deleted the obsolete tools.mjs file"
- 2025-10-15T14:27:28Z @tobiu referenced in commit `c4a2c83` - "#7477 ensuring the return value of nextCursor is a string"
- 2025-10-15T14:45:44Z @tobiu referenced in commit `4b9b403` - "#7477 added healthcheck as a tool"
- 2025-10-15T17:42:54Z @tobiu referenced in commit `d52d356` - "#7477 pr service: author.login description (confusing, since it contains the name)"
### @tobiu - 2025-10-20T10:56:45Z

resolved. i will create more epics for specific enhancements.

- 2025-10-20T10:56:45Z @tobiu closed this issue

