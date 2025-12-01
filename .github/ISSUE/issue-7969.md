---
id: 7969
title: Harden Agent Cognitive Loop (Reflection & Error Handling)
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T16:04:23Z'
updatedAt: '2025-12-01T16:09:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7969'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Harden Agent Cognitive Loop (Reflection & Error Handling)

**Goal:** Harden the `Neo.ai.agent.Loop` implementation to be production-ready.
**Scope:**
1.  **Reflection Logic:** Implement the `reflect(event, result, actionResult)` phase in the loop.
2.  **Error Recovery:** Implement retry logic with exponential backoff and a Dead Letter Queue (`failedEvents`) for unrecoverable errors.
3.  **State Machine:** Formalize state transitions (`idle` <-> `thinking` <-> `acting`) with validation to prevent invalid states.
**Context:** Follow-up to Epic #7961. Feedback from code review.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu assigned to @tobiu

