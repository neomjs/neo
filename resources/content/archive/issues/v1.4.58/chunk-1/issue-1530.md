---
id: 1530
title: 'draggable.DragZone: dragStart() => remove the main thread call'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-10T15:58:52Z'
updatedAt: '2021-03-10T15:59:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1530'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-10T15:59:30Z'
---
# draggable.DragZone: dragStart() => remove the main thread call

i think the dragElement is always included inside the event data path (or targetPath), in which case we don't need to get the DOMRect from the main thread (performance).

## Timeline

- 2021-03-10T15:58:53Z @tobiu added the `enhancement` label
- 2021-03-10T15:58:53Z @tobiu assigned to @tobiu
- 2021-03-10T15:59:23Z @tobiu referenced in commit `4a733d6` - "draggable.DragZone: dragStart() => remove the main thread call #1530"
- 2021-03-10T15:59:30Z @tobiu closed this issue

