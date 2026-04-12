---
id: 9919
title: 'feat: Implement fs.watch Daemonization for Autonomous Orchestrator'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T13:23:03Z'
updatedAt: '2026-04-12T13:23:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9919'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Implement fs.watch Daemonization for Autonomous Orchestrator

### Description
Currently, the `Neo.ai.agent.Orchestrator` runs as a single-turn execution, parsing `sandman_handoff.md` and triggering the Swarm. To achieve true continuous automation, the Orchestrator needs to run as a persistent daemon.

### Architectural Rationale
- We need to attach an `fs.watch` listener (or equivalent polling structure) to the `sandman_handoff.md` manifest safely.
- When `DreamService` generates a new handoff file overnight, the Orchestrator should seamlessly boot up the agent cluster, inject the `system:golden-path` events, and go back to sleep.
- **Agent Context:** This allows the Swarm to trigger asynchronously decoupling the orchestration cycle completely from manual CLI execution.

***
**Origin Session ID:** 95bf4a2b-d84e-4f70-945b-f558ba924d3a

## Timeline

- 2026-04-12T13:23:04Z @tobiu added the `enhancement` label
- 2026-04-12T13:23:04Z @tobiu added the `ai` label

