---
id: 7725
title: 'Docs: Update Memory Core API Guide for MCP SDK'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-08T12:18:05Z'
updatedAt: '2025-11-08T12:20:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7725'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-08T12:20:12Z'
---
# Docs: Update Memory Core API Guide for MCP SDK

**Reported by:** @tobiu on 2025-11-08

The `learn/guides/ai/MemoryCoreMcpApi.md` guide was outdated, describing the Memory Core server as an Express.js-based REST API. This has been updated to reflect its current implementation as a tool server using the `@modelcontextprotocol/sdk`.

Key changes include:
-   **Architecture Update:** The guide now correctly describes the server as an MCP SDK application that communicates over stdio, not an HTTP server.
-   **From Endpoints to Tools:** The main body of the document was rewritten to describe the available **tools** (e.g., `add_memory`, `query_summaries`) instead of REST endpoints. The old `curl`-based examples were replaced with conceptual `call_tool()` examples.
-   **New Tools Table:** A summary table of all available tools, grouped by category, was added for quick reference.
-   **Updated Error Handling:** The section on error handling was updated to describe the `isError: true` flag in an MCP tool response, replacing the obsolete information about HTTP status codes.
-   **Cleanup:** The "Migration Path" section was removed as it's complete, and the path to the `openapi.yaml` file was corrected. All references to Express, Swagger, and HTTP were removed.

The guide now accurately documents the current state and usage of the Memory Core MCP server.

