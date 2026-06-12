---
id: 1420
title: 'draggable.DragZone: resetData()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-09T10:00:09Z'
updatedAt: '2020-11-09T10:25:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1420'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-09T10:25:36Z'
---
# draggable.DragZone: resetData()

onDragEnd() needs to call this new method, which needs to reset the data config with a tiny delay (drag:end happens before drop, so we need to ensure that drop can still access it).

## Timeline

- 2020-11-09T10:00:09Z @tobiu added the `enhancement` label
- 2020-11-09T10:00:09Z @tobiu assigned to @tobiu
- 2020-11-09T10:25:22Z @tobiu referenced in commit `6432f5c` - "draggable.DragZone: resetData() #1420"
- 2020-11-09T10:25:36Z @tobiu closed this issue

