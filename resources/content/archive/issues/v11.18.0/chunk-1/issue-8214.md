---
id: 8214
title: Fix Neural Link Server startup crash due to health check schema mismatch
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T10:19:06Z'
updatedAt: '2025-12-30T10:20:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8214'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T10:20:51Z'
---
# Fix Neural Link Server startup crash due to health check schema mismatch

The `Server.mjs` attempts to access `health.server.activeSessions` and `health.server.connectedWindows`, but the updated `HealthService` (from #8212) returns this data under the `health.session` property (e.g., `health.session.activeApps`).

This causes a crash during startup log output.

**Resolution:**
Update `ai/mcp/server/neural-link/Server.mjs` to map the `health.session` properties correctly in `logStartupStatus`.

## Timeline

- 2025-12-30T10:19:07Z @tobiu added the `bug` label
- 2025-12-30T10:19:07Z @tobiu added the `ai` label
- 2025-12-30T10:19:15Z @tobiu added parent issue #8169
- 2025-12-30T10:19:41Z @tobiu assigned to @tobiu
- 2025-12-30T10:20:09Z @tobiu referenced in commit `4ef277b` - "Fix Neural Link Server startup crash due to health check schema mismatch #8214"
- 2025-12-30T10:20:51Z @tobiu closed this issue

