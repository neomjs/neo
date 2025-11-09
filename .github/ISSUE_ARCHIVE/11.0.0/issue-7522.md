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
closedAt: '2025-10-17T11:52:55Z'
---
# Refactor Memory Core OpenAPI for MCP

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7520 - Epic: Migrate Memory Server to stdio-based MCP

---

This ticket involves refactoring the existing `openapi.yaml` from its RESTful structure to a flat, `operationId`-driven format suitable for an MCP server. Each REST endpoint will be translated into a distinct tool.

## Acceptance Criteria

1.  The `openapi.yaml` in `ai/mcp/server/memory-core/` is updated.
2.  Each path/method combination from the old API is converted into a unique operation with a descriptive `operationId` (e.g., `add_memory`, `query_summaries`).
3.  The `paths` object is flattened, removing the RESTful URL structure.
4.  All schemas, descriptions, and examples are preserved and correctly associated with their new tool definitions.

