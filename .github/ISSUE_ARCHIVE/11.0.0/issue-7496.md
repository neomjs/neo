---
id: 7496
title: Add Annotations to MCP Tool Definitions
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T11:45:10Z'
updatedAt: '2025-10-15T11:55:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7496'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-15T11:55:24Z'
---
# Add Annotations to MCP Tool Definitions

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

The MCP tool specification allows for optional `annotations` to describe tool behavior (e.g., whether an operation is mutating or safe). This metadata is valuable for AI agents to make more intelligent and safer decisions, for example by requiring stricter user confirmation for mutating actions.

This ticket covers adding support for these annotations.

## Acceptance Criteria

1.  A convention for defining annotations in `openapi.yaml` is established (e.g., a custom `x-annotations` field).
2.  At least one mutating tool (e.g., `checkout_pull_request`) is updated in `openapi.yaml` with an annotation like `{"mutating": true}`.
3.  `toolService.mjs` is refactored to parse these annotations and include them in the tool definitions.
4.  The `tools/list` response is verified to include the new `annotations` property for relevant tools.

