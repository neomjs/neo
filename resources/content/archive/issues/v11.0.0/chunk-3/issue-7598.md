---
id: 7598
title: Finalize MCP Server Config Refactoring
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T08:49:32Z'
updatedAt: '2025-10-22T09:01:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7598'
author: tobiu
commentsCount: 0
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T09:01:33Z'
---
# Finalize MCP Server Config Refactoring

This ticket tracks the final steps of the MCP server configuration refactoring. The monolithic `ai/mcp/server/config.mjs` has been split into three new, server-specific configuration files:

- `ai/mcp/server/github-workflow/config.mjs`
- `ai/mcp/server/knowledge-base/config.mjs`
- `ai/mcp/server/memory-core/config.mjs`

This task is to update all server-side modules to import from their respective new config files and then to remove the old, monolithic config.

## Acceptance Criteria

1.  All modules within `ai/mcp/server/github-workflow/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
2.  All modules within `ai/mcp/server/knowledge-base/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
3.  All modules within `ai/mcp/server/memory-core/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
4.  The old `ai/mcp/server/config.mjs` file is deleted.

## Timeline

- 2025-10-22T08:49:32Z @tobiu assigned to @tobiu
- 2025-10-22T08:49:33Z @tobiu added parent issue #7590
- 2025-10-22T08:49:34Z @tobiu added the `enhancement` label
- 2025-10-22T08:49:34Z @tobiu added the `ai` label
- 2025-10-22T08:49:34Z @tobiu added the `refactoring` label
- 2025-10-22T08:50:32Z @tobiu referenced in commit `501b28e` - "Finalize MCP Server Config Refactoring #7598"
- 2025-10-22T09:01:33Z @tobiu closed this issue

