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

## Timeline

- 2026-01-01T17:26:48Z @tobiu added the `ai` label
- 2026-01-01T17:26:48Z @tobiu added the `refactoring` label
- 2026-01-01T17:27:09Z @tobiu added parent issue #8169
- 2026-01-01T17:52:10Z @tobiu closed this issue
- 2026-01-01T17:53:42Z @tobiu assigned to @tobiu
- 2026-01-04T03:10:28Z @jonnyamsp referenced in commit `aaeaa6e` - "feat(ai): Implement Neural Link toJSON protocol for Client Services and Managers

- Implement toJSON in manager.DragCoordinator
- Implement toJSON in manager.Window
- Refactor ComponentService to use toJSON protocol
- Refactor DataService to use toJSON protocol
- Refactor RuntimeService to use toJSON protocol
- Update ai.client.Service.safeSerialize to prioritize toJSON

Closes #8269
Closes #8270
Closes #8271
Closes #8272
Closes #8273"

