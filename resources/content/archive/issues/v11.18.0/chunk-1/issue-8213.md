---
id: 8213
title: Log App Name in Neural Link Bridge connections
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T10:00:42Z'
updatedAt: '2025-12-30T10:04:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8213'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T10:04:29Z'
---
# Log App Name in Neural Link Bridge connections

To improve observability of the Neural Link Bridge, we should log the name of the application connecting to it.

**Changes:**
1.  **Client (`src/ai/Client.mjs`):** Pass `appName` as a query parameter when connecting to the Bridge.
2.  **Bridge (`ai/mcp/server/neural-link/Bridge.mjs`):** Extract and log the `appName` upon connection.

**Example Log:**
`[INFO] Bridge: App connected [uuid] (AgentOS)`

## Timeline

- 2025-12-30T10:00:43Z @tobiu added the `enhancement` label
- 2025-12-30T10:00:43Z @tobiu added the `ai` label
- 2025-12-30T10:00:46Z @tobiu added parent issue #8169
- 2025-12-30T10:03:40Z @tobiu referenced in commit `d549d3a` - "feat(ai): Log App Name in Neural Link Bridge connections (#8213)

- Client: Pass appName from config to Bridge query params
- Bridge: Log appName on connection and include in broadcast"
### @tobiu - 2025-12-30T10:03:46Z

**Input from Gemini:**

> ✦ I have implemented the logging of `appName` in Bridge connections.
> - **Client:** Extracts `appName` from `Neo.config.appPath` and sends it.
> - **Bridge:** Logs the name and includes it in the `app_connected` event.
> 
> Example log: `[INFO] Bridge: App connected [id] (agentos)`
> 
> This completes ticket #8213.

- 2025-12-30T10:03:55Z @tobiu assigned to @tobiu
- 2025-12-30T10:04:29Z @tobiu closed this issue

