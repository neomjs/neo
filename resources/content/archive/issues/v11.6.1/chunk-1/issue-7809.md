---
id: 7809
title: 'Refactor: Use npm package version in MCP servers'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T13:45:21Z'
updatedAt: '2025-11-19T13:50:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7809'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T13:50:23Z'
---
# Refactor: Use npm package version in MCP servers

We are currently hardcoding the version to '1.0.0' in our MCP server instances. Since we start these servers via `npm run`, we should leverage the `npm_package_version` environment variable to use the actual project version defined in `package.json`.

Affected files:
- `ai/mcp/server/github-workflow/mcp-stdio.mjs`
- `ai/mcp/server/memory-core/mcp-stdio.mjs`
- `ai/mcp/server/knowledge-base/mcp-stdio.mjs`

## Timeline

- 2025-11-19T13:45:22Z @tobiu added the `enhancement` label
- 2025-11-19T13:45:22Z @tobiu added the `ai` label
- 2025-11-19T13:45:22Z @tobiu added the `refactoring` label
- 2025-11-19T13:45:44Z @tobiu assigned to @tobiu
- 2025-11-19T13:50:11Z @tobiu referenced in commit `ff452b6` - "Refactor: Use npm package version in MCP servers #7809"
- 2025-11-19T13:50:23Z @tobiu closed this issue

