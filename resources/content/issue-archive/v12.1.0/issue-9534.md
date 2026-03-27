---
id: 9534
title: Rename mcp-stdio.mjs to mcp-server.mjs
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-03-23T17:20:17Z'
updatedAt: '2026-03-23T17:30:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9534'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-23T17:30:01Z'
---
# Rename mcp-stdio.mjs to mcp-server.mjs

### Description
Currently, the entry point files for our MCP servers are named `mcp-stdio.mjs`. With the introduction of the dual-transport architecture (supporting both `stdio` and `sse` via `StreamableHTTPServerTransport`), this name is no longer accurate and is misleading.

We need to rename these files to a more transport-agnostic name, such as `mcp-server.mjs`.

### Tasks
- Rename `ai/mcp/server/*/mcp-stdio.mjs` to `ai/mcp/server/*/mcp-server.mjs`
- Update `package.json` scripts (`ai:mcp-server-...`)
- Update mentions in documentation files (e.g., `learn/guides/mcp/...`)
- Update mentions in `.gemini/settings.json` and similar setup configs.
- **Breaking Change Warning:** This is a breaking change for any users who have hardcoded the `mcp-stdio.mjs` path in their AI client configurations (like Claude Desktop or Gemini CLI). This needs to be highlighted in the release notes.

## Timeline

- 2026-03-23T17:20:18Z @tobiu added the `enhancement` label
- 2026-03-23T17:20:18Z @tobiu added the `ai` label
- 2026-03-23T17:20:19Z @tobiu added the `refactoring` label
- 2026-03-23T17:20:31Z @tobiu assigned to @tobiu
- 2026-03-23T17:29:16Z @tobiu referenced in commit `f1f85ad` - "refactor(ai): Rename mcp-stdio.mjs to mcp-server.mjs (#9534)"
### @tobiu - 2026-03-23T17:29:33Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully renamed all `mcp-stdio.mjs` files to `mcp-server.mjs`. I also updated the references in `package.json`, the memory-core `HealthService`, and all related documentation files. The changes have been committed and pushed.

- 2026-03-23T17:30:01Z @tobiu closed this issue

