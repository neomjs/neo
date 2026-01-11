---
id: 8313
title: Fix Neural Link Server startup handshake deadlock
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-04T15:00:26Z'
updatedAt: '2026-01-04T15:02:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8313'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T15:02:24Z'
---
# Fix Neural Link Server startup handshake deadlock

The `Neural Link MCP Server` (`Server.mjs`) currently awaits `ConnectionService.ready()` before establishing the `StdioServerTransport` connection to the MCP client.

**Problem:**
If the Bridge process takes time to spawn, or if `ConnectionService` hangs waiting for a connection, the MCP Server never connects to the transport. This prevents the MCP Client (Antigravity/Gemini) from successfully performing the initial handshake and listing tools, resulting in a "Method not found" error.

**Fix:**
Move the `transport.connect()` call to *before* the `ConnectionService.ready()` await. This ensures the MCP server is responsive to tool discovery requests immediately, even if the backend service (Bridge) is still initializing.

## Timeline

- 2026-01-04T15:00:27Z @tobiu added the `bug` label
- 2026-01-04T15:00:27Z @tobiu added the `ai` label
- 2026-01-04T15:00:27Z @tobiu added the `architecture` label
- 2026-01-04T15:00:38Z @tobiu added parent issue #8169
- 2026-01-04T15:01:30Z @tobiu assigned to @tobiu
- 2026-01-04T15:02:18Z @tobiu referenced in commit `767d4b2` - "Fix Neural Link Server startup handshake deadlock #8313"
- 2026-01-04T15:02:24Z @tobiu closed this issue

