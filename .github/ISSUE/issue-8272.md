---
id: 8272
title: '[Neural Link] Refactor DataService to use toJSON protocol'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-01T17:26:43Z'
updatedAt: '2026-01-01T17:53:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8272'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T17:52:10Z'
---
# [Neural Link] Refactor DataService to use toJSON protocol

Update `src/ai/client/DataService.mjs` to rely on `toJSON`.
*   `getRecord`: Use `record.toJSON()` (already done, verify).
*   `inspectStateProvider`: Use `provider.toJSON()`.
*   `inspectStore`: Use `store.toJSON()`.

## Activity Log

- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `refactoring` label
- 2026-01-01 @tobiu added parent issue #8169
- 2026-01-01 @tobiu closed this issue
- 2026-01-01 @tobiu assigned to @tobiu

