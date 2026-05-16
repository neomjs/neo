---
id: 7522
title: Refactor Memory Core OpenAPI for MCP
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T11:24:50Z'
updatedAt: '2025-10-17T11:52:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7522'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T11:52:55Z'
---
# Refactor Memory Core OpenAPI for MCP

This ticket involves refactoring the existing `openapi.yaml` from its RESTful structure to a flat, `operationId`-driven format suitable for an MCP server. Each REST endpoint will be translated into a distinct tool.

## Acceptance Criteria

1.  The `openapi.yaml` in `ai/mcp/server/memory-core/` is updated.
2.  Each path/method combination from the old API is converted into a unique operation with a descriptive `operationId` (e.g., `add_memory`, `query_summaries`).
3.  The `paths` object is flattened, removing the RESTful URL structure.
4.  All schemas, descriptions, and examples are preserved and correctly associated with their new tool definitions.

## Timeline

- 2025-10-17T11:24:50Z @tobiu assigned to @tobiu
- 2025-10-17T11:24:51Z @tobiu added the `enhancement` label
- 2025-10-17T11:24:52Z @tobiu added the `ai` label
- 2025-10-17T11:24:52Z @tobiu added parent issue #7520
- 2025-10-17T11:52:48Z @tobiu referenced in commit `019a1d3` - "Refactor Memory Core OpenAPI for MCP #7522"
- 2025-10-17T11:52:56Z @tobiu closed this issue

