---
id: 7611
title: Decouple Logger by Duplicating into Each MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T13:55:09Z'
updatedAt: '2025-10-22T13:56:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7611'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-22T13:56:03Z'
---
# Decouple Logger by Duplicating into Each MCP Server

**Reported by:** @tobiu on 2025-10-22

The current `ai/mcp/server/logger.mjs` is a centralized logger that incorrectly imports the `debug` configuration from `github-workflow/config.mjs`. This creates a tight coupling and prevents other MCP servers (Knowledge Base, Memory Core) from using their own `debug` settings.

Furthermore, the long-term vision is to move the GitHub Workflow and Memory Core MCP servers into their own independent npm packages. A centralized logger that relies on a specific configuration path within the `neo.mjs` repository would hinder this decoupling.

To address these issues, the `logger.mjs` file should be duplicated into each MCP server's directory. Each server will then have its own `logger.mjs` that imports its respective `config.mjs`, ensuring proper `debug` flag usage and enabling future independence.

## Acceptance Criteria

1.  The `ai/mcp/server/logger.mjs` file is deleted.
2.  A new `logger.mjs` file is created in `ai/mcp/server/github-workflow/`. This file imports `../config.mjs` and provides the logging functionality.
3.  A new `logger.mjs` file is created in `ai/mcp/server/knowledge-base/`. This file imports `../config.mjs` and provides the logging functionality.
4.  A new `logger.mjs` file is created in `ai/mcp/server/memory-core/`. This file imports `../config.mjs` and provides the logging functionality.
5.  All files within the `github-workflow` server that previously imported the centralized logger are updated to import `../logger.mjs` (or `./logger.mjs` if in the same directory).
6.  All files within the `knowledge-base` server that previously imported the centralized logger are updated to import `../logger.mjs`.
7.  All files within the `memory-core` server that previously imported the centralized logger are updated to import `../logger.mjs`.

