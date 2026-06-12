---
id: 7612
title: Implement Command-Line Debug Flag Override for MCP Servers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T14:11:06Z'
updatedAt: '2025-10-22T14:12:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7612'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T14:12:46Z'
---
# Implement Command-Line Debug Flag Override for MCP Servers

Currently, the `debug` flag for each MCP server is determined solely by its respective `config.mjs` file. To enhance flexibility and ease of debugging, it should be possible to override this `debug` setting via a command-line argument when launching the MCP server (e.g., `gemini --debug`).

This feature allows developers to enable or disable verbose logging on the fly without modifying configuration files, which is particularly useful in development and testing environments.

## Resolution

Instead of modifying each server's `mcp-stdio.mjs` entry point, the solution was implemented by directly modifying each `logger.mjs` file. Each logger now checks `process.argv` for the presence of a `--debug` command-line flag. If the flag is found, it overrides the `debug` setting from `aiConfig.debug` locally within the logger's scope.

This approach is clean, avoids `neo.mjs` dependency, and ensures the `debug` flag is correctly set for each logger based on its own config and the command-line override.

## Acceptance Criteria

1.  Each MCP server's `logger.mjs` file (`ai/mcp/server/github-workflow/logger.mjs`, `ai/mcp/server/knowledge-base/logger.mjs`, `ai/mcp/server/memory-core/logger.mjs`) is modified.
2.  Within these `logger.mjs` files, `process.argv` is parsed to detect the presence of a `--debug` command-line flag.
3.  If the `--debug` flag is present, the logger's output is enabled regardless of the `aiConfig.debug` setting.
4.  The logger correctly reflects this overridden `debug` state.

## Timeline

- 2025-10-22T14:11:06Z @tobiu assigned to @tobiu
- 2025-10-22T14:11:07Z @tobiu added the `enhancement` label
- 2025-10-22T14:11:07Z @tobiu added the `ai` label
- 2025-10-22T14:12:38Z @tobiu referenced in commit `ac462c0` - "Implement Command-Line Debug Flag Override for MCP Servers #7612"
- 2025-10-22T14:12:46Z @tobiu closed this issue

