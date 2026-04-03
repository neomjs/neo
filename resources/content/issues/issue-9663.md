---
id: 9663
title: Fix MCP Servers CWD Resolution for Antigravity Compatibility
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-03T15:07:41Z'
updatedAt: '2026-04-03T15:29:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9663'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T15:29:03Z'
---
# Fix MCP Servers CWD Resolution for Antigravity Compatibility

The `knowledge-base` and `memory-core` MCP servers are currently failing to start in constrained environments like Antigravity. The issue is due to incorrect `cwd` resolution caused by `config.mjs` being imported and statically evaluated *before* any CLI `--cwd` flags can be parsed in Node. This results in database paths attempting to create files at the OS root level (`/`), throwing the `ENOENT: mkdir '/chroma-neo-knowledge-base'` error.

**Proposed Fix:**
Implement manual CLI argument parsing directly inside `config.mjs` for both servers to extract the `--cwd` or `-w` flags before the initial paths are resolved in `defaultConfig`. Additionally, ensure `mcp_config.json` uses this argument.

## Timeline

- 2026-04-03T15:07:43Z @tobiu added the `bug` label
- 2026-04-03T15:07:43Z @tobiu added the `ai` label
### @tobiu - 2026-04-03T15:29:03Z

Closing premature draft. Addressed properly under #9664 after root cause analysis.

- 2026-04-03T15:29:03Z @tobiu closed this issue

