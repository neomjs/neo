---
id: 28
title: Update MCP server scripts to use config files
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T13:05:16Z'
updatedAt: '2025-12-02T13:06:16Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/28'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T13:06:16Z'
---
# Update MCP server scripts to use config files

Update the `ai:mcp-server-*` scripts in `tasks/createPackageJson.mjs` to include the configuration file arguments.

This ensures the MCP servers launch with the correct local configuration generated in `ai/mcp/server/*/config.json`.

**Changes:**
- `ai:mcp-server-github-workflow`: Add `-c ./ai/mcp/server/github-workflow/config.json`
- `ai:mcp-server-knowledge-base`: Add `-c ./ai/mcp/server/knowledge-base/config.json`
- `ai:mcp-server-memory-core`: Add `-c ./ai/mcp/server/memory-core/config.json`

## Activity Log

- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `76f626b` - "Update MCP server scripts to use config files #28"
- 2025-12-02 @tobiu closed this issue

