---
id: 1315
title: 'tree.List: ctor => throw an error in case draggable and sortable are both true'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-26T12:10:49Z'
updatedAt: '2020-10-26T12:13:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1315'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-26T12:13:14Z'
---
# tree.List: ctor => throw an error in case draggable and sortable are both true

right now the plan is to either use a DragZone OR a SortZone.

A combination of both would require a new implementation (a SortZone with an "optional" boundaryContainer, e.g. moving x px outside of the boundaryContainer => switch to the DragZone logic).

## Timeline

- 2020-10-26T12:10:49Z @tobiu added the `enhancement` label
- 2020-10-26T12:10:49Z @tobiu assigned to @tobiu
- 2020-10-26T12:13:07Z @tobiu referenced in commit `4f12499` - "tree.List: ctor => throw an error in case draggable and sortable are both true #1315"
- 2020-10-26T12:13:14Z @tobiu closed this issue

