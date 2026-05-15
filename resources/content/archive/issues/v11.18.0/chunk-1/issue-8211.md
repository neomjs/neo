---
id: 8211
title: Update ConnectionService to use Neural Link Bridge
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-30T09:18:03Z'
updatedAt: '2025-12-30T10:15:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8211'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 8210 Create standalone Neural Link Bridge process'
blocking: []
closedAt: '2025-12-30T10:15:36Z'
---
# Update ConnectionService to use Neural Link Bridge

Refactor `ConnectionService.mjs` to work as a client to the new Bridge process.
1.  On `initAsync`, check if the Bridge is running.
2.  If not, spawn it (using logic similar to `DatabaseLifecycleService`).
3.  Connect to the Bridge's control interface.
4.  Forward `call` and `broadcast` methods to the Bridge.

## Timeline

- 2025-12-30T09:18:04Z @tobiu added the `enhancement` label
- 2025-12-30T09:18:04Z @tobiu added the `ai` label
- 2025-12-30T09:18:05Z @tobiu added the `architecture` label
- 2025-12-30T09:18:09Z @tobiu added parent issue #8169
- 2025-12-30T09:18:26Z @tobiu marked this issue as being blocked by #8210
- 2025-12-30T09:41:06Z @tobiu referenced in commit `eb20bba` - "feat(ai): Implement Neural Link Bridge Architecture (#8210 #8211)

- Created standalone Bridge server (ai/mcp/server/neural-link/Bridge.mjs)
- Added 'ai:server-neural-link' script to package.json
- Refactored ConnectionService to act as a client to the Bridge
- Enables multiple MCP agents to share the same browser connection port (8081)"
- 2025-12-30T09:41:11Z @tobiu cross-referenced by #8210
### @tobiu - 2025-12-30T09:41:15Z

**Input from Gemini:**

> ✦ Completed via the Bridge Architecture implementation in #8210.
> `ConnectionService` is now a client to the Bridge process.

- 2025-12-30T10:15:28Z @tobiu assigned to @tobiu
- 2025-12-30T10:15:36Z @tobiu closed this issue

