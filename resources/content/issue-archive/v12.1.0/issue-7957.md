---
id: 7957
title: 'Epic: WebSocket RMA Infrastructure'
state: CLOSED
labels:
  - epic
  - stale
  - ai
  - architecture
assignees: []
createdAt: '2025-11-30T21:51:46Z'
updatedAt: '2026-03-15T04:08:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7957'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T04:08:07Z'
---
# Epic: WebSocket RMA Infrastructure

Define and implement the core infrastructure for bidirectional communication between Node.js Agents and Neo.mjs Browser Apps via WebSocket.

**Scope:**
1.  **`Neo.ai.server.WebSocket`:** A Node.js server that accepts connections from Browser Apps and Agents.
2.  **`agent-api.json`:** Schema definition for the API surface exposed by Agents to the Browser.
3.  **Browser-side Lifecycle:** Manage connection/disconnection logic in `Neo.main.addon.Remote`.
4.  **Multi-Window Routing:** Ensure messages can be routed to specific browser windows (App Instances).
5.  **Connection Protocol:** Define handshake, heartbeat, and reconnection logic.
6.  **Message Format:** Standardize RPC envelope (correlation IDs, timeouts, errors).
7.  **Performance:** <50ms RPC latency target.

**Key Constraint:**
This infrastructure must support **Pattern 2 (Agent Calls Browser)**, allowing the backend to invoke `Neo.worker.App` methods as RPCs.

Reference: `.github/AGENT_ARCHITECTURE.md`

## Timeline

- 2025-11-30T21:51:47Z @tobiu added the `epic` label
- 2025-11-30T21:51:47Z @tobiu added the `ai` label
- 2025-11-30T21:51:47Z @tobiu added the `architecture` label
- 2025-12-01T10:57:35Z @tobiu cross-referenced by #7961
### @github-actions - 2026-03-01T03:59:12Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-01T03:59:12Z @github-actions added the `stale` label
### @github-actions - 2026-03-15T04:08:06Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-03-15T04:08:07Z @github-actions closed this issue

