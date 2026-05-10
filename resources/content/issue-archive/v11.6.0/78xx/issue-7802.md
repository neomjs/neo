---
id: 7802
title: Add CLI argument parsing to GitHub Workflow MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-19T10:16:03Z'
updatedAt: '2025-11-19T10:59:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7802'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T10:59:33Z'
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

## Timeline

- 2025-11-19T10:16:03Z @tobiu added the `enhancement` label
- 2025-11-19T10:16:04Z @tobiu added the `ai` label
- 2025-11-19T10:17:41Z @tobiu assigned to @tobiu
- 2025-11-19T10:59:10Z @tobiu referenced in commit `a0d5a42` - "Add CLI argument parsing to GitHub Workflow MCP Server #7802"
- 2025-11-19T10:59:33Z @tobiu closed this issue

