---
id: 7802
title: Add CLI argument parsing to GitHub Workflow MCP Server
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-19T10:16:03Z'
updatedAt: '2025-11-19T10:16:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7802'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Add CLI argument parsing to GitHub Workflow MCP Server

To make the GitHub Workflow MCP server reusable in other projects, we need to allow configuring the path to the configuration file via command-line arguments.

The `ai/mcp/server/github-workflow/mcp-stdio.mjs` entry point should use `commander` to parse arguments.

**Requirements:**
1.  Add `commander` usage to `ai/mcp/server/github-workflow/mcp-stdio.mjs`.
2.  Implement a `--config <path>` (or `-c <path>`) option.
3.  Pass the parsed config path to the internal configuration loading logic.

**Implementation Details:**
-   Update `ai/mcp/server/github-workflow/mcp-stdio.mjs` to parse args.
-   Refactor `ai/mcp/server/github-workflow/config.mjs` to allow loading from a specific path or merging with an external config.

## Activity Log

- 2025-11-19 @tobiu added the `enhancement` label
- 2025-11-19 @tobiu added the `ai` label

