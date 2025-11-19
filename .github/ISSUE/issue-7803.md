---
id: 7803
title: Support --debug flag via commander in GitHub Workflow MCP Server
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-19T11:02:34Z'
updatedAt: '2025-11-19T11:02:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7803'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Support --debug flag via commander in GitHub Workflow MCP Server

The current debugging implementation relies on manually parsing `process.argv` inside `ai/mcp/server/github-workflow/logger.mjs`. Since we are now using `commander`, we should standardize this behavior.

**Tasks:**
1.  Update `ai/mcp/server/github-workflow/mcp-stdio.mjs` to support a `--debug` (and `-d`) option using `commander`.
2.  If the debug flag is present, update `aiConfig.debug` to `true`.
3.  Refactor `ai/mcp/server/github-workflow/logger.mjs` to rely solely on `aiConfig.debug` (via `aiConfig.data.debug` or the proxy access), removing the manual `process.argv` check.

This consolidation ensures a single source of truth for the debug state and leverages the CLI parsing library correctly.

## Activity Log

- 2025-11-19 @tobiu added the `enhancement` label
- 2025-11-19 @tobiu added the `ai` label
- 2025-11-19 @tobiu added the `refactoring` label

