---
id: 7837
title: Cleanup redundant awaits in self-healing example
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-21T09:14:26Z'
updatedAt: '2025-11-21T09:16:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7837'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T09:16:22Z'
---
# Cleanup redundant awaits in self-healing example

The `ai/examples/self-healing.mjs` script currently awaits both `LifecycleService` and `ChromaManager` for each service. With the recent refactoring (issue #7836), `ChromaManager.ready()` is sufficient as it ensures the lifecycle service is ready. This task removes the redundant calls.

## Activity Log

- 2025-11-21 @tobiu added the `ai` label
- 2025-11-21 @tobiu added the `refactoring` label
- 2025-11-21 @tobiu assigned to @tobiu
- 2025-11-21 @tobiu referenced in commit `eb3d42c` - "Cleanup redundant awaits in self-healing example #7837"
- 2025-11-21 @tobiu closed this issue

