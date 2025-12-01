---
id: 7966
title: Implement Safety Guardrails for Agent
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-01T12:46:06Z'
updatedAt: '2025-12-01T12:46:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7966'
author: tobiu
commentsCount: 0
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added parent issue #7961

