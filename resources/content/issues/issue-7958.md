---
id: 7958
title: 'Epic: Telemetry & Observability'
state: OPEN
labels:
  - epic
  - stale
  - ai
  - architecture
assignees: []
createdAt: '2025-11-30T21:51:57Z'
updatedAt: '2026-03-01T03:59:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7958'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Epic: Telemetry & Observability

Implement the "Hybrid Client" and Event Streaming logic to solve the "Blind Agent" problem.

**Scope:**
1.  **Agent Event Listener:** Update `Neo.ai.Agent` to support simultaneous MCP (Tool) and WebSocket (Event) connections.
2.  **Worker-side Log Interceptor:** Create `Neo.worker.mixin.LogBridge` to capture console logs and exceptions in App/Data/Canvas workers.
3.  **Log Forwarding:** Stream these logs via the WebSocket RMA channel to the Agent.
4.  **Event Stream:** Expose high-level Neo.mjs framework events (`neo:window:connect`, `neo:component:mount`) to the Agent.
5.  **Event Filtering:** Implement subscription mechanism (e.g., `agent.subscribe(['neo:error'])`) to prevent flooding.

**Strategic Goal:**
Enable agents to "see" runtime errors and state changes immediately without polling.

Reference: `.github/AGENT_ARCHITECTURE.md`

## Timeline

- 2025-11-30T21:51:58Z @tobiu added the `epic` label
- 2025-11-30T21:51:58Z @tobiu added the `ai` label
- 2025-11-30T21:51:58Z @tobiu added the `architecture` label
- 2025-12-01T10:57:35Z @tobiu cross-referenced by #7961
### @github-actions - 2026-03-01T03:59:10Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-01T03:59:11Z @github-actions added the `stale` label

