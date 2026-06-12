---
id: 8010
title: Align Neural Link MCP Server with Memory Core Server
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-03T12:15:15Z'
updatedAt: '2025-12-03T13:47:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8010'
author: tobiu
commentsCount: 1
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T13:47:41Z'
---
# Align Neural Link MCP Server with Memory Core Server

Align the `neural-link` MCP server implementation with the `memory-core` server to ensure consistency and robustness.

Tasks:
1. Create `ai/mcp/server/neural-link/config.mjs` adapted from `memory-core`.
2. Refactor `ai/mcp/server/neural-link/mcp-stdio.mjs` to use `commander` for CLI args and proper error handling.
3. Update `ai/mcp/server/neural-link/Server.mjs` to respect the configuration.

## Timeline

- 2025-12-03T12:15:16Z @tobiu added the `ai` label
- 2025-12-03T12:15:16Z @tobiu added the `refactoring` label
- 2025-12-03T13:47:26Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-03T13:47:41Z

resolved via #8007

- 2025-12-03T13:47:41Z @tobiu closed this issue
- 2025-12-03T14:06:43Z @tobiu added parent issue #7960

