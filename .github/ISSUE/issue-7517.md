---
id: 7517
title: Refactor toolService.mjs to Reduce Code Duplication
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T10:37:09Z'
updatedAt: '2025-10-17T10:37:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7517'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T10:37:56Z'
---
# Refactor toolService.mjs to Reduce Code Duplication

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

This ticket addresses the code duplication between the `toolService.mjs` files in the `knowledge-base` and `github-workflow` MCP servers. The goal is to create a single, shared `toolService` that can be configured for each server, reducing redundancy and improving maintainability.

## Acceptance Criteria

1.  A new, generic `toolService.mjs` is created in `ai/mcp/server/`.
2.  The new service is parameterized to accept a `serviceMapping` and an `openApiFilePath`.
3.  The `toolService.mjs` files in `knowledge-base` and `github-workflow` are refactored to use the new shared service.
4.  All existing functionality of both MCP servers remains unchanged and fully operational.

