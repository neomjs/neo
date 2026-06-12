---
id: 1364
title: 'main.addon.DragDrop: onDragEnd() => create a PoC to get the path behind the dragProxy element'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-02T13:19:58Z'
updatedAt: '2020-11-02T13:20:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1364'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-02T13:20:34Z'
---
# main.addon.DragDrop: onDragEnd() => create a PoC to get the path behind the dragProxy element

this one is tricky, since `document.elementFromPoint()` will always return the drag proxy el, which in most cases is applied to the doc body using position:absolute.

## Timeline

- 2020-11-02T13:19:58Z @tobiu added the `enhancement` label
- 2020-11-02T13:19:58Z @tobiu assigned to @tobiu
- 2020-11-02T13:20:24Z @tobiu referenced in commit `72b6bd1` - "main.addon.DragDrop: onDragEnd() => create a PoC to get the path behind the dragProxy element #1364"
- 2020-11-02T13:20:34Z @tobiu closed this issue
- 2020-11-02T13:21:54Z @tobiu cross-referenced by #1365

