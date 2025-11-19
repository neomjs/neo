---
id: 7804
title: Add CLI argument parsing and Config refactoring to Memory Core MCP Server
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-19T11:12:48Z'
updatedAt: '2025-11-19T11:12:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7804'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-11-19 @tobiu added the `enhancement` label
- 2025-11-19 @tobiu added the `ai` label
- 2025-11-19 @tobiu added the `refactoring` label

