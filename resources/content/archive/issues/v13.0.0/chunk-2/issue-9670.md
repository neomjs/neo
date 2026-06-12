---
id: 9670
title: Fix MCP server path resolution dependencies on process.cwd()
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T23:29:03Z'
updatedAt: '2026-04-03T23:32:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9670'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T23:32:03Z'
---
# Fix MCP server path resolution dependencies on process.cwd()

When spawning MCP node servers (like `knowledge-base` and `memory-core`) from external tools, `process.cwd()` evaluates to the runner's working directory rather than the Neo.mjs repository root. 

This causes silent failures, specifically causing the knowledge-base synchronization to extract 0 chunks because it incorrectly looks for the `src` folder inside the runner's working directory.

**Resolution:**
Replace all instances of `process.cwd()` inside the MCP servers with a deterministic absolute path computed relative to the running module's location (`neoRootDir`), ensuring consistent file resolution regardless of how the script is executed.

## Timeline

- 2026-04-03T23:29:05Z @tobiu added the `bug` label
- 2026-04-03T23:29:05Z @tobiu added the `ai` label
- 2026-04-03T23:29:35Z @tobiu assigned to @tobiu
- 2026-04-03T23:31:30Z @tobiu referenced in commit `ad8f6bc` - "fix(mcp): Ensure stable path resolution independent of runner's cwd (#9670)"
- 2026-04-03T23:32:03Z @tobiu closed this issue

