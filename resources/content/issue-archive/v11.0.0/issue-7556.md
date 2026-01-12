---
id: 7556
title: Convert GitHub Workflow healthService to HealthService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T22:23:50Z'
updatedAt: '2025-10-19T22:33:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7556'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T22:33:32Z'
---
# Convert GitHub Workflow healthService to HealthService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/github-workflow/services/healthService.mjs` into a singleton `HealthService` class that extends `Neo.core.Base`. This is the first step in migrating the GitHub Workflow server to the consistent Neo.mjs service architecture used by the other MCP servers.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/healthService.mjs` is renamed to `HealthService.mjs`.
2.  The content is replaced with a `HealthService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `healthcheck` function is converted into a class method.
4.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `HealthService` class.
5.  The `healthcheck` tool continues to function correctly after the refactoring.

## Timeline

- 2025-10-19T22:23:51Z @tobiu assigned to @tobiu
- 2025-10-19T22:23:52Z @tobiu added the `enhancement` label
- 2025-10-19T22:23:52Z @tobiu added the `ai` label
- 2025-10-19T22:23:52Z @tobiu added parent issue #7536
- 2025-10-19T22:32:56Z @tobiu referenced in commit `0510414` - "Convert GitHub Workflow healthService to HealthService Neo.mjs Class #7556"
- 2025-10-19T22:33:32Z @tobiu closed this issue

