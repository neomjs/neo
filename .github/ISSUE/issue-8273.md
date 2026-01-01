---
id: 8273
title: '[Neural Link] Refactor RuntimeService to use toJSON protocol'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-01T17:26:47Z'
updatedAt: '2026-01-01T17:53:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8273'
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
# [Neural Link] Refactor RuntimeService to use toJSON protocol

Update `src/ai/client/RuntimeService.mjs`.
*   `getDragState`: Use `DragCoordinator.toJSON()`.
*   `getWindowInfo`: Use `WindowManager.toJSON()`.

## Activity Log

- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `refactoring` label
- 2026-01-01 @tobiu added parent issue #8169
- 2026-01-01 @tobiu closed this issue
- 2026-01-01 @tobiu assigned to @tobiu

