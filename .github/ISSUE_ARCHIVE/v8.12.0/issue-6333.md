---
id: 6333
title: >-
  draggable.toolbar.DragZone: adjustToolbarItemCls() => the wrapperCls does not
  always get applied
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-29T17:27:22Z'
updatedAt: '2025-01-29T20:13:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6333'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-29T17:27:38Z'
---
# draggable.toolbar.DragZone: adjustToolbarItemCls() => the wrapperCls does not always get applied

Without adding a delay, the wrapperCls does not always get applied. Review it once style updates are fully vdom based.

Adding a workaround fix for now (plus a todo).

## Comments

### @tobiu - 2025-01-29 20:13

clean fix via https://github.com/neomjs/neo/issues/6334

## Activity Log

- 2025-01-29 @tobiu added the `bug` label
- 2025-01-29 @tobiu assigned to @tobiu
- 2025-01-29 @tobiu referenced in commit `f1d3500` - "draggable.toolbar.DragZone: adjustToolbarItemCls() => the wrapperCls does not always get applied #6333"
- 2025-01-29 @tobiu closed this issue

