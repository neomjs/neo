---
id: 9903
title: Implement `executeNLActionDigest` in DreamService for Neural Link Data Synthesis
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T10:10:04Z'
updatedAt: '2026-04-12T10:10:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9903'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement `executeNLActionDigest` in DreamService for Neural Link Data Synthesis

### Context & Motivation
In Session `8f55968e-45d3-4012-ba2f-d1757061e1d2` (PR #9902), the `RecorderService` was implemented to trace all Neural Link tool invocations natively into the `nl_action_log` within `memory-core.sqlite`. 

This ticket represents the next evolutionary step: **Closing the Feedback Loop**. We must transform those raw, low-level interaction sequences into deterministic, static Playwright test suites (`*.spec.mjs`).

### Architectural Requirements
1. **The Daemon Query**: Implement `executeNLActionDigest()` within the `DreamService.mjs` asynchronous daemon. The query must retrieve un-digested action sequences grouped by `sessionId` and `turnId`.
2. **LLM Synthesis Prompt**: Construct the specialized prompt orchestration. The prompt must evaluate generic Neural Link events (clicks, assertions) and synthesize a formal Neo.mjs Playwright script that validates the UI flow.
3. **Data Mutation**: Mark the synthesized memory sequences with a status indicating they have been "digested" to prevent redundant cron runs.

### References
- **Origin Session ID**: `8f55968e-45d3-4012-ba2f-d1757061e1d2` (Agents: use `get_session_memories` to pull context).
- **Related PR**: #9902

## Timeline

- 2026-04-12T10:10:05Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:05Z @tobiu added the `ai` label

