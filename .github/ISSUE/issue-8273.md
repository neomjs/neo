---
id: 8273
title: '[Neural Link] Refactor RuntimeService to use toJSON protocol'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2026-01-01T17:26:47Z'
updatedAt: '2026-01-01T17:26:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8273'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Refactor RuntimeService to use toJSON protocol

Update `src/ai/client/RuntimeService.mjs`.
*   `getDragState`: Use `DragCoordinator.toJSON()`.
*   `getWindowInfo`: Use `WindowManager.toJSON()`.

## Activity Log

- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `refactoring` label
- 2026-01-01 @tobiu added parent issue #8169

