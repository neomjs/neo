---
id: 9908
title: 'Meta: The A2A Contextual Bridge Protocol (End of Session Handoff)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T10:19:06Z'
updatedAt: '2026-04-12T10:19:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9908'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Meta: The A2A Contextual Bridge Protocol (End of Session Handoff)

### Context & Motivation
During session `8f55968e-45d3-4012-ba2f-d1757061e1d2`, we realized that generating follow-up tickets at the end of a successful workflow provides massive strategic value. 

However, new agent sessions spawned to tackle those tickets suffer from "Zero-State Amnesia." We can solve this by embedding the originating Memory Core `sessionId` natively into the GitHub Issue body.

Since the Agent Swarm processes roughly 15 tickets daily, follow-up items are addressed rapidly. The local `memory-core.sqlite` repository (which does not prune raw memories like the Vector Graph prunes nodes) will reliably retain this session context for subsequent local Agent invocations. Human developers encountering the ticket can safely ignore the ID while still reading the human-readable description.

### Task
Formally update the Agent Operational Mandates (`AGENTS.md` / `AGENTS_STARTUP.md`) to codify the **A2A Contextual Bridge Protocol**:

1. **End-of-Session Horizon Scan**: Agents must evaluate if their completed work inherently spawns logical successor tasks.
2. **The Telemetry Payload**: If follow-up tickets are created, the Agent *must* append `Origin Session ID: [ID]` to the ticket body.
3. **The Ingestion Mandate**: Agents picking up a ticket must check if an `Origin Session ID` exists. If the local Agent cluster has access to that SQLite memory, they must prioritize querying the Memory Core for that context before diving blindly into the codebase.

### References
- **Origin Session ID**: `8f55968e-45d3-4012-ba2f-d1757061e1d2`

## Timeline

- 2026-04-12T10:19:12Z @tobiu added the `enhancement` label
- 2026-04-12T10:19:12Z @tobiu added the `ai` label

