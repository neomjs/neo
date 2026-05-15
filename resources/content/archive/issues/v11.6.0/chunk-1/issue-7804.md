---
id: 7804
title: Add CLI argument parsing and Config refactoring to Memory Core MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T11:12:48Z'
updatedAt: '2025-11-19T11:18:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7804'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T11:18:52Z'
---
# Add CLI argument parsing and Config refactoring to Memory Core MCP Server

Apply the same configuration and CLI argument parsing improvements to the Memory Core MCP server as were done for the GitHub Workflow server.

**Tasks:**
1.  Refactor `ai/mcp/server/memory-core/config.mjs` to:
    -   Use the Proxy pattern to expose configuration data.
    -   Implement a `load(filePath)` method that supports both JSON and JS/MJS files.
    -   Store configuration values in a `data` property on the singleton instance.
2.  Update `ai/mcp/server/memory-core/mcp-stdio.mjs` to:
    -   Use `commander` for CLI argument parsing.
    -   Support `-c, --config <path>` to load a custom configuration file.
    -   Support `-d, --debug` to enable debug logging (and update `aiConfig.data.debug`).
3.  Update `ai/mcp/server/memory-core/logger.mjs` (if applicable/similar to GitHub workflow) to rely solely on `aiConfig.debug`.

**Goal:**
Standardize the configuration and startup logic across MCP servers for better maintainability and flexibility.

## Timeline

- 2025-11-19T11:12:50Z @tobiu added the `enhancement` label
- 2025-11-19T11:12:50Z @tobiu added the `ai` label
- 2025-11-19T11:12:50Z @tobiu added the `refactoring` label
- 2025-11-19T11:16:28Z @tobiu assigned to @tobiu
- 2025-11-19T11:17:19Z @tobiu referenced in commit `4120324` - "Add CLI argument parsing and Config refactoring to Memory Core MCP Server #7804"
- 2025-11-19T11:18:52Z @tobiu closed this issue

