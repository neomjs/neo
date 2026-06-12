---
id: 1254
title: 'draggable.DragZone: add a css rule to the toolbar on drag:start'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-16T09:41:13Z'
updatedAt: '2020-10-16T09:49:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1254'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-16T09:49:12Z'
---
# draggable.DragZone: add a css rule to the toolbar on drag:start

like: "neo-is-dragging".

remove it on drag:end.

this way, we can add animation styles to toolbar items only in case a drag OP is happening.

## Timeline

- 2020-10-16T09:41:13Z @tobiu added the `enhancement` label
- 2020-10-16T09:41:14Z @tobiu assigned to @tobiu
### @tobiu - 2020-10-16T09:42:57Z

actually, we should do this inside draggable.DragZone to keep the feature available for all use cases.

- 2020-10-16T09:43:06Z @tobiu changed title from **draggable.toolbar.SortZone: add a css rule to the toolbar on drag:start** to **draggable.DragZone: add a css rule to the toolbar on drag:start**
- 2020-10-16T09:46:40Z @tobiu referenced in commit `f3372b3` - "draggable.DragZone: add a css rule to the toolbar on drag:start #1254"
- 2020-10-16T09:49:04Z @tobiu referenced in commit `6d704e2` - "#1254 added neo-is-dragging to the toolbar SortZone css rule"
- 2020-10-16T09:49:12Z @tobiu closed this issue

