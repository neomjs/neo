---
id: 9920
title: 'feat: Agent Error Recovery & Re-Queueing for Orchestrator'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T13:23:04Z'
updatedAt: '2026-04-12T13:23:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9920'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Agent Error Recovery & Re-Queueing for Orchestrator

### Description
When an agent encounters a "Productive Failure" Loop (Tripwire) or hits the 25-turn global limit without resolving a Golden Path task, the `Orchestrator` needs a headless mechanism to capture and re-queue that failure state safely.

### Architectural Rationale
- If `Neo.ai.Agent` throws an uncaught context window failure during execution, the Orchestrator should catch it without crashing the process.
- **A2A Context:** The Orchestrator must write telemetry back to the Memory Core. It needs to confirm whether the injected `issueId` succeeded or failed, so the next `runSandman.mjs` dream cycle can either natively suppress the node or maintain its urgency in the matrix.

***
**Origin Session ID:** 95bf4a2b-d84e-4f70-945b-f558ba924d3a

## Timeline

- 2026-04-12T13:23:05Z @tobiu added the `enhancement` label
- 2026-04-12T13:23:05Z @tobiu added the `ai` label

