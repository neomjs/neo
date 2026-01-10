---
id: 7908
title: Refactor vdom.Helper initAsync to use optional chaining
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-26T12:12:58Z'
updatedAt: '2025-11-26T12:16:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7908'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-26T12:16:41Z'
---
# Refactor vdom.Helper initAsync to use optional chaining

In `src/vdom/Helper.mjs`, the `initAsync` method currently checks `!NeoConfig.unitTestMode` before accessing `Neo.currentWorker`.
Using optional chaining `Neo.currentWorker?.on(...)` is cleaner and handles cases where `currentWorker` is undefined without an explicit mode check.

## Timeline

- 2025-11-26 @tobiu added the `ai` label
- 2025-11-26 @tobiu added the `refactoring` label
- 2025-11-26 @tobiu assigned to @tobiu
- 2025-11-26 @tobiu referenced in commit `f7b79d5` - "Refactor vdom.Helper initAsync to use optional chaining #7908"
- 2025-11-26 @tobiu closed this issue

