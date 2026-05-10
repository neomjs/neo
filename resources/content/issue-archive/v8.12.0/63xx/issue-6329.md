---
id: 6329
title: 'main.addon.DragDrop: onDragMove() => be more restrictive with left & top positioning'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-29T12:31:30Z'
updatedAt: '2025-01-29T12:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6329'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-29T12:32:38Z'
---
# main.addon.DragDrop: onDragMove() => be more restrictive with left & top positioning

* left should only get touched if `moveHorizontal` is set to true
* top should only get touched if `moveVertical` is set to true

the reasoning is that `margin` & `padding` on the boundary container does not always play nicely otherwise.

## Timeline

- 2025-01-29T12:31:30Z @tobiu added the `enhancement` label
- 2025-01-29T12:31:30Z @tobiu assigned to @tobiu
- 2025-01-29T12:31:51Z @tobiu referenced in commit `51ef3d3` - "main.addon.DragDrop: onDragMove() => be more restrictive with left & top positioning #6329"
- 2025-01-29T12:32:38Z @tobiu closed this issue

