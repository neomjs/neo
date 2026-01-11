---
id: 7562
title: Refactor MCP Service ClassNames to Use Full Server Names
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T23:18:41Z'
updatedAt: '2025-10-19T23:21:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7562'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T23:21:35Z'
---
# Refactor MCP Service ClassNames to Use Full Server Names

The current `className` definitions for services within the MCP servers use inconsistent or abbreviated names for the server part of the namespace (e.g., `github` instead of `github-workflow`).

To improve clarity, consistency, and discoverability, all service class names should be updated to use the full, correct server directory name as part of their namespace.

## Acceptance Criteria

1.  **GitHub Workflow Server:**
    -   All services in `ai/mcp/server/github-workflow/services/` should have their `className` updated from `Neo.ai.mcp.server.github.*` to `Neo.ai.mcp.server.github-workflow.*`.

2.  **Knowledge Base Server:**
    -   All services in `ai/mcp/server/knowledge-base/services/` should have their `className` updated from `Neo.ai.mcp.server.knowledgebase.*` to `Neo.ai.mcp.server.knowledge-base.*`.

3.  **Memory Core Server:**
    -   All services in `ai/mcp/server/memory-core/services/` should have their `className` updated from `AI.mcp.server.memory.*` to `Neo.ai.mcp.server.memory-core.*`.

*(Note: This is a straightforward find-and-replace task that can be applied across the respective server directories.)*

## Timeline

- 2025-10-19T23:18:41Z @tobiu assigned to @tobiu
- 2025-10-19T23:18:42Z @tobiu added the `enhancement` label
- 2025-10-19T23:18:42Z @tobiu added the `ai` label
- 2025-10-19T23:18:42Z @tobiu added parent issue #7536
- 2025-10-19T23:21:27Z @tobiu referenced in commit `7a30903` - "Refactor MCP Service ClassNames to Use Full Server Names #7562"
- 2025-10-19T23:21:35Z @tobiu closed this issue

