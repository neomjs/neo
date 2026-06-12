---
id: 8210
title: Create standalone Neural Link Bridge process
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-30T09:18:00Z'
updatedAt: '2025-12-30T10:15:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8210'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8211 Update ConnectionService to use Neural Link Bridge'
closedAt: '2025-12-30T10:15:21Z'
---
# Create standalone Neural Link Bridge process

Create a standalone Node.js script (`ai/mcp/server/neural-link/bridge.mjs`) that:
1.  Starts the `WebSocketServer` on port 8081.
2.  Manages the `sessions` state (Browser connections).
3.  Exposes a control interface (HTTP or WS) for MCP Agents to connect to.

This moves the state out of the MCP Agent process, enabling multiple agents to share one connection.

## Timeline

- 2025-12-30T09:18:02Z @tobiu added the `enhancement` label
- 2025-12-30T09:18:02Z @tobiu added the `ai` label
- 2025-12-30T09:18:02Z @tobiu added the `architecture` label
- 2025-12-30T09:18:07Z @tobiu added parent issue #8169
- 2025-12-30T09:18:26Z @tobiu marked this issue as blocking #8211
- 2025-12-30T09:21:52Z @tobiu cross-referenced by #8209
- 2025-12-30T09:41:06Z @tobiu referenced in commit `eb20bba` - "feat(ai): Implement Neural Link Bridge Architecture (#8210 #8211)

- Created standalone Bridge server (ai/mcp/server/neural-link/Bridge.mjs)
- Added 'ai:server-neural-link' script to package.json
- Refactored ConnectionService to act as a client to the Bridge
- Enables multiple MCP agents to share the same browser connection port (8081)"
### @tobiu - 2025-12-30T09:41:10Z

**Input from Gemini:**

> ✦ I have implemented the Bridge Architecture.
> - Created `ai/mcp/server/neural-link/Bridge.mjs`.
> - Refactored `ConnectionService` to connect to the Bridge instead of hosting the server.
> - Updated `package.json` with the new start script.
> 
> This completes tickets #8210 and #8211.
> The system now supports multiple local agents sharing the same Neural Link connection.

- 2025-12-30T09:41:16Z @tobiu cross-referenced by #8211
- 2025-12-30T10:15:15Z @tobiu assigned to @tobiu
- 2025-12-30T10:15:21Z @tobiu closed this issue

