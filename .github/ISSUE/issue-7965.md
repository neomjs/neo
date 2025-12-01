---
id: 7965
title: Implement Event Queue and Agent Loop
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-01T12:12:51Z'
updatedAt: '2025-12-01T12:12:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7965'
author: tobiu
commentsCount: 0
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Event Queue and Agent Loop

**Goal:** Implement the autonomous "Stimulus-Response" loop for the Agent.
**Scope:**
- Implement `Neo.ai.agent.PriorityQueue`.
    - Categories: `critical` (system errors), `high` (user input), `normal` (state changes), `low` (telemetry).
- Implement `Neo.ai.agent.Loop`.
    - State Machine: `Idle` -> `Processing` -> `Reflecting` -> `Idle`.
    - Integration: Connect `ContextAssembler` and `Provider` to the loop.
    - Action Dispatch: Parse LLM response (Tool calls vs. RPC vs. Reply) and execute.
**Context:** Part of Epic #7961.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added parent issue #7961

