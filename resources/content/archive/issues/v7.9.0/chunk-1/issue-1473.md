---
id: 1473
title: 'examples.tree => draggable: true for dist versions'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2020-12-03T15:48:39Z'
updatedAt: '2024-09-27T02:34:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1473'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:04Z'
---
# examples.tree => draggable: true for dist versions

while it does work fine inside the dev mode, it does not inside the dist env.

the "neo-draggable" css class does not get applied to tree nodes.

it could be related to the store.load() timing.

will take a closer look into draggable.list.DragZone.

## Timeline

- 2020-12-03T15:48:39Z @tobiu added the `bug` label
- 2020-12-03T15:48:40Z @tobiu assigned to @tobiu
### @tobiu - 2020-12-03T16:00:57Z

`adjustListItemCls()` gets triggered at a different time indeed.

dev mode: owner rendered === false, owner rendering === true

dist dev: owner rendered === false, owner rendering === false

### @github-actions - 2024-09-13T02:30:53Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:30:53Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:04Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:04Z @github-actions closed this issue

