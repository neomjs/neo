---
id: 9664
title: Fix MCP server CWD resolution in Antigravity Sandbox
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T15:26:21Z'
updatedAt: '2026-04-03T15:28:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9664'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T15:28:23Z'
---
# Fix MCP server CWD resolution in Antigravity Sandbox

The `knowledge-base` and `memory-core` MCP servers fail with `ENOENT` during `fs.ensureDir` when launched by the Antigravity sandbox. This occurs because `process.cwd()` evaluates to `/` inside the sandbox environment, where the file system is read-only.

This ticket implements a protective fallback identical to the one used in `github-workflow`, resolving the `cwd` to the project root when it detects `/`.

## Timeline

- 2026-04-03T15:26:24Z @tobiu added the `bug` label
- 2026-04-03T15:26:24Z @tobiu added the `ai` label
- 2026-04-03T15:27:50Z @tobiu referenced in commit `954f14f` - "fix: Implement CWD fallback for Antigravity sandbox in MCP servers (#9664)

The knowledge-base and memory-core MCP servers were failing with ENOENT when attempting to create directories because the Antigravity sandbox evaluates process.cwd() to '/'. This commit copies the established protective fallback from github-workflow to resolve the sandbox cwd anomaly gracefully, restoring seamless initialization without breaking the native execution loop."
- 2026-04-03T15:28:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-03T15:28:22Z

Applied protective fallback from `github-workflow` into `knowledge-base` and `memory-core` configs to correctly handle proxy path modifications injected by Antigravity sandbox environment.

- 2026-04-03T15:28:23Z @tobiu closed this issue
- 2026-04-03T15:29:03Z @tobiu cross-referenced by #9663

