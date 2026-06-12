---
id: 8333
title: Fix Neural Link Server startup crash due to Health Check response structure change
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T12:28:49Z'
updatedAt: '2026-01-05T12:31:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8333'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T12:31:23Z'
---
# Fix Neural Link Server startup crash due to Health Check response structure change

The Neural Link MCP Server crashes on startup with `TypeError: Cannot read properties of undefined (reading 'activeApps')`.
This is caused by a recent change in `HealthService.healthcheck()` response structure (commit `9613d448`), where `health.session` was replaced by `health.sessions`.
`Server.logStartupStatus` still tries to access `health.session.activeApps`.

## Timeline

- 2026-01-05T12:28:50Z @tobiu added the `bug` label
- 2026-01-05T12:28:50Z @tobiu added the `ai` label
- 2026-01-05T12:29:36Z @tobiu assigned to @tobiu
- 2026-01-05T12:30:07Z @tobiu added parent issue #8169
- 2026-01-05T12:30:55Z @tobiu referenced in commit `4e5a9d2` - "fix(ai): Resolve Neural Link Server startup crash (#8333)

Updated Server.mjs to handle the new HealthService response structure (sessions/windows arrays). Fixed TypeError on startup."
- 2026-01-05T12:31:23Z @tobiu closed this issue

