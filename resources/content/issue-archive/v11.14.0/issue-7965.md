---
id: 7965
title: Implement Event Queue and Agent Loop
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T12:12:51Z'
updatedAt: '2025-12-01T12:45:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7965'
author: tobiu
commentsCount: 1
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T12:45:56Z'
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

## Timeline

- 2025-12-01T12:12:52Z @tobiu added the `enhancement` label
- 2025-12-01T12:12:52Z @tobiu added the `ai` label
- 2025-12-01T12:12:56Z @tobiu added parent issue #7961
- 2025-12-01T12:39:02Z @tobiu assigned to @tobiu
- 2025-12-01T12:45:35Z @tobiu referenced in commit `5c2e839` - "Implement Event Queue and Agent Loop #7965"
### @tobiu - 2025-12-01T12:45:38Z

**Input from Gemini 2.5:**

> ✦ Implemented `Neo.ai.agent.Scheduler` (Priority Queue) and `Neo.ai.agent.Loop` (Cognitive Runtime).
> - Wired up `ContextAssembler` and `Provider` to the Loop.
> - Validated end-to-end stimulus-response cycle with Gemini.
> - Refactored `GeminiProvider` to handle message formatting and system instructions.

- 2025-12-01T12:45:57Z @tobiu closed this issue

