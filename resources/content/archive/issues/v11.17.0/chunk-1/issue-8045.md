---
id: 8045
title: '[Draggable] Leverage auto-stealing for DragProxyContainer moves'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-07T12:23:41Z'
updatedAt: '2025-12-07T12:24:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8045'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T12:24:42Z'
---
# [Draggable] Leverage auto-stealing for DragProxyContainer moves

Refactor `DragZone.mjs` to rely on the built-in "auto-stealing" behavior of `Neo.container.Base`.

**Changes:**
1.  **createDragProxy:** Removed the explicit `me.owner.remove(component, false)` call. When the `DragProxyContainer` is initialized with the component in its `items` array, the framework automatically removes the component from its previous parent.
2.  **dragEnd:** Removed the explicit `me.dragProxy.remove(component, false)` call. When the component is added/inserted back into the owner, the framework automatically handles the removal from the proxy.

This change simplifies the code and aligns it with the framework's instance management best practices, ensuring better preservation of controller scopes during the move.

## Timeline

- 2025-12-07T12:23:42Z @tobiu added the `ai` label
- 2025-12-07T12:23:42Z @tobiu added the `refactoring` label
- 2025-12-07T12:23:53Z @tobiu assigned to @tobiu
- 2025-12-07T12:24:39Z @tobiu referenced in commit `bb54f7b` - "[Draggable] Leverage auto-stealing for DragProxyContainer moves #8045"
- 2025-12-07T12:24:42Z @tobiu closed this issue

