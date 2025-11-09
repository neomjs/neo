---
id: 7527
title: Refactor Health Service to Remove Redundant Try/Catch
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:19:44Z'
updatedAt: '2025-10-17T12:23:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7527'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T12:23:32Z'
---
# Refactor Health Service to Remove Redundant Try/Catch

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7520 - Epic: Migrate Memory Server to stdio-based MCP

---

The `buildHealthResponse` function in `healthService.mjs` contains two inner `try...catch` blocks that are redundant. The empty `catch` blocks obscure the logic. This ticket is to remove them for clarity.

## Acceptance Criteria

1.  The `buildHealthResponse` function in `healthService.mjs` is updated.
2.  The two inner `try...catch` blocks are removed.
3.  The logic remains correct: if a collection doesn't exist, its `exists` flag is correctly reported as `false` and its `count` as `0`.

