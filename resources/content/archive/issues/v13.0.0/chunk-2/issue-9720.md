---
id: 9720
title: Fix Memory Core MCP Initialization Error ('N' character parsing)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T13:24:31Z'
updatedAt: '2026-04-05T13:25:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9720'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T13:25:51Z'
---
# Fix Memory Core MCP Initialization Error ('N' character parsing)

The `neo-mjs-memory-core` MCP server was failing to initialize with an `invalid character 'N' looking for beginning of value` JSON parsing error on standard output.

We identified isolated `console.log` statements inside `ai/graph/Database.mjs` ("NEW EDGES BEING ADDED: 0") that polluted the MCP `stdio` JSON-RPC transport stream.

Resolution:
- Cleaned up leftover `console.log` traces in `Database.mjs`.
- Cleaned up redundant Ollama fetch failure traces in `DreamService.mjs` and `Ollama.mjs`.
- Added missing `'dummy embedding function'` warning bypass inside `ChromaManager.mjs`.
- Fixed missing namespace bootstrapping in `CollectionBug.spec.mjs`.

## Timeline

- 2026-04-05T13:24:33Z @tobiu added the `bug` label
- 2026-04-05T13:24:33Z @tobiu added the `ai` label
- 2026-04-05T13:25:21Z @tobiu assigned to @tobiu
- 2026-04-05T13:25:40Z @tobiu referenced in commit `0e08665` - "fix: Resolve MCP invalid character 'N' startup failure by removing stray console.log traces (#9720)"
### @tobiu - 2026-04-05T13:25:50Z

Removed stray `console.log` traces causing stdio pollution. Verified MCP initializes gracefully. Fix pushed to dev branch.

- 2026-04-05T13:25:52Z @tobiu closed this issue

