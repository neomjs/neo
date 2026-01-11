---
id: 7805
title: Add CLI argument parsing and Config refactoring to Knowledge Base MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T11:20:50Z'
updatedAt: '2025-11-19T11:25:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7805'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T11:25:48Z'
---
# Add CLI argument parsing and Config refactoring to Knowledge Base MCP Server

Apply the same configuration and CLI argument parsing improvements to the Knowledge Base MCP server as were done for the GitHub Workflow and Memory Core servers.

**Tasks:**
1.  Refactor `ai/mcp/server/knowledge-base/config.mjs` to:
    -   Use the Proxy pattern to expose configuration data.
    -   Implement a `load(filePath)` method that supports both JSON and JS/MJS files.
    -   Store configuration values in a `data` property on the singleton instance.
2.  Update `ai/mcp/server/knowledge-base/mcp-stdio.mjs` to:
    -   Use `commander` for CLI argument parsing.
    -   Support `-c, --config <path>` to load a custom configuration file.
    -   Support `-d, --debug` to enable debug logging (and update `aiConfig.data.debug`).
3.  Update `ai/mcp/server/knowledge-base/logger.mjs` (if applicable) to rely solely on `aiConfig.debug`.

**Goal:**
Standardize the configuration and startup logic across all three MCP servers (GitHub Workflow, Memory Core, Knowledge Base).

## Timeline

- 2025-11-19T11:20:51Z @tobiu added the `enhancement` label
- 2025-11-19T11:20:51Z @tobiu added the `ai` label
- 2025-11-19T11:20:51Z @tobiu added the `refactoring` label
- 2025-11-19T11:25:15Z @tobiu assigned to @tobiu
- 2025-11-19T11:25:41Z @tobiu referenced in commit `bfa75e8` - "Add CLI argument parsing and Config refactoring to Knowledge Base MCP Server #7805"
- 2025-11-19T11:25:48Z @tobiu closed this issue

