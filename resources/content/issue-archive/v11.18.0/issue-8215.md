---
id: 8215
title: Expose connected agents in Neural Link health check
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T10:24:34Z'
updatedAt: '2025-12-30T10:30:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8215'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T10:30:58Z'
---
# Expose connected agents in Neural Link health check

The Neural Link Bridge knows which agents are connected. This information should be exposed in the health check response to allow agents to see if they are "alone" or if other agents are present.

**Tasks:**
1.  **Bridge Update:** Modify `Bridge.mjs` to broadcast `agent_connected` and `agent_disconnected` events to all connected agents (similar to how it handles apps).
2.  **Client Update:** Update `ConnectionService.mjs` to listen for these events and maintain a local `agents` registry.
3.  **Schema Update:** Update `openapi.yaml` to include an `agents` array in the `HealthCheckResponse` schema.
4.  **Service Update:** Update `HealthService.mjs` to expose this data.

This provides better observability into the multi-agent environment.

## Timeline

- 2025-12-30T10:24:35Z @tobiu added the `enhancement` label
- 2025-12-30T10:24:36Z @tobiu added the `ai` label
- 2025-12-30T10:24:43Z @tobiu added parent issue #8169
- 2025-12-30T10:24:51Z @tobiu assigned to @tobiu
- 2025-12-30T10:30:48Z @tobiu referenced in commit `e071005` - "Expose connected agents in Neural Link health check #8215"
- 2025-12-30T10:30:58Z @tobiu closed this issue

