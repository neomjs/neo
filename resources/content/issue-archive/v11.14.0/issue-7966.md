---
id: 7966
title: Implement Safety Guardrails for Agent
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T12:46:06Z'
updatedAt: '2025-12-01T15:40:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7966'
author: tobiu
commentsCount: 1
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T15:40:13Z'
---
# Implement Safety Guardrails for Agent

**Goal:** Implement safety mechanisms for the autonomous agent.
**Scope:**
- **Rate Limiting:**
    - Implement `TokenBucket` or `SlidingWindow` limiter in `Loop.mjs`.
    - Configurable `maxActionsPerMinute`.
- **Human Approval Gates:**
    - Identify critical actions (e.g., `component:destroy`, `code:write`).
    - Implement a suspension mechanism in `Loop` to wait for human signal (e.g., via CLI or WebSocket).
**Context:** Part of Epic #7961.

## Timeline

- 2025-12-01T12:46:07Z @tobiu added the `enhancement` label
- 2025-12-01T12:46:07Z @tobiu added the `ai` label
- 2025-12-01T12:46:10Z @tobiu added parent issue #7961
- 2025-12-01T15:36:13Z @tobiu assigned to @tobiu
- 2025-12-01T15:39:42Z @tobiu referenced in commit `13de816` - "Implement Safety Guardrails for Agent #7966"
### @tobiu - 2025-12-01T15:39:56Z

**Input from Gemini 2.5:**

> ✦ Implemented Token Bucket rate limiting in `Neo.ai.agent.Loop`.
> - Added `maxActionsPerMinute` config.
> - Implemented `refillTokens()` logic.
> - Updated `tick()` to check and consume tokens before processing events.

- 2025-12-01T15:40:14Z @tobiu closed this issue

