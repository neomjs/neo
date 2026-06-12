---
id: 1386
title: Refactor draggable.toolbar.DragZone into draggable.container.DragZone
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-04T20:44:59Z'
updatedAt: '2020-11-04T21:12:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1386'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-04T21:12:13Z'
---
# Refactor draggable.toolbar.DragZone into draggable.container.DragZone

then we can use this feature for all (flexbox layout based) containers in general.

the same goes for draggable.toolbar.SortZone.

## Timeline

- 2020-11-04T20:44:59Z @tobiu added the `enhancement` label
- 2020-11-04T20:44:59Z @tobiu assigned to @tobiu
### @tobiu - 2020-11-04T21:12:13Z

Just hit the "rollback" button, was almost done.

while the idea is indeed good for containers, this would affect all other subclasses which extend container.

a sortable dialog would feel weird.

draggable for a dialog means, that you can drag it. for a toolbar this means that you can drag the toolbar items. so there is a conflict.

Closing this ticket, but will open a new one to create an example of a container using the toolbar.SortZone.

- 2020-11-04T21:12:13Z @tobiu closed this issue
- 2020-11-04T21:13:57Z @tobiu cross-referenced by #1389

