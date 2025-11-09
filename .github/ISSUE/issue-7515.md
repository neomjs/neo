---
id: 7515
title: Healthcheck tool returns unstructured content
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T12:58:44Z'
updatedAt: '2025-10-16T13:53:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7515'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T13:53:26Z'
---
# Healthcheck tool returns unstructured content

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

When running the `healthcheck` tool on the `neo-knowledge-base` MCP server, it fails with the error: `MCP error -32600: Tool healthcheck has an output schema but did not return structured content`.

This indicates that the object returned by the `healthService.healthcheck` function does not match the `HealthCheckResponse` schema defined in `openapi.yaml`.

## Acceptance Criteria

1.  The `healthService.mjs` file is reviewed and corrected.
2.  The `healthcheck` function is modified to return a JSON object that strictly conforms to the `HealthCheckResponse` schema.
3.  Running the `healthcheck` tool successfully returns the structured health status without any MCP errors.

