---
id: 7561
title: Refactor AI Config for Server-Specific Namespacing
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T23:09:11Z'
updatedAt: '2025-10-19T23:15:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7561'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T23:15:33Z'
---
# Refactor AI Config for Server-Specific Namespacing

The `ai/mcp/server/config.mjs` file currently mixes global and server-specific configurations at the top level. To improve clarity and scalability, we need to introduce server-specific namespaces.

This ticket covers refactoring the configuration for the `memory-core` server by creating a new `memoryCore` object. The existing `memory` and `sessions` configurations will be moved inside this new object and renamed for better clarity.

## Acceptance Criteria

1.  A new `memoryCore` object is added to the `aiConfig` in `ai/mcp/server/config.mjs`.
2.  The existing `memory` config object is moved inside `memoryCore` and renamed to `memoryDb`.
3.  The existing `sessions` config object is moved inside `memoryCore` and renamed to `sessionDb`.
4.  All services within the `ai/mcp/server/memory-core/` directory are updated to use the new configuration paths (e.g., `aiConfig.memoryCore.memoryDb.port`).
5.  The memory-core server continues to function correctly after the refactoring.

## Timeline

- 2025-10-19T23:09:11Z @tobiu assigned to @tobiu
- 2025-10-19T23:09:12Z @tobiu added the `enhancement` label
- 2025-10-19T23:09:12Z @tobiu added the `ai` label
- 2025-10-19T23:09:12Z @tobiu added parent issue #7536
- 2025-10-19T23:13:21Z @tobiu referenced in commit `94c5c56` - "Refactor AI Config for Server-Specific Namespacing #7561"
- 2025-10-19T23:14:55Z @tobiu referenced in commit `0d90fc7` - "#7561 content order"
- 2025-10-19T23:15:33Z @tobiu closed this issue

