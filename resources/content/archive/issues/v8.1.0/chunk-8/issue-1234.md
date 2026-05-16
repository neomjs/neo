---
id: 1234
title: 'draggable.DragZone: afterSetBoundaryContainerId() => should not get limited to components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-11T11:34:29Z'
updatedAt: '2020-10-11T11:45:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1234'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-11T11:45:07Z'
---
# draggable.DragZone: afterSetBoundaryContainerId() => should not get limited to components

we need a check if the container is mounted.

since boundaryContainerId is supposed to be a vdom / vnode id and does not have to be an own component, we should move the owner config into the DragZone base class and check this one for its mounted state.

## Timeline

- 2020-10-11T11:34:29Z @tobiu added the `enhancement` label
- 2020-10-11T11:34:29Z @tobiu assigned to @tobiu
- 2020-10-11T11:35:34Z @tobiu referenced in commit `562764d` - "#1234 draggable.DragZone: owner config"
- 2020-10-11T11:43:05Z @tobiu referenced in commit `3017bc5` - "#1234 dialog.Base: added the owner config for the DragZone"
- 2020-10-11T11:43:49Z @tobiu referenced in commit `45300f4` - "#1234 draggable.toolbar.DragZone: removed the owner config"
- 2020-10-11T11:44:59Z @tobiu referenced in commit `d8aa510` - "#1234 calendar.WeekEventDragZone, list.DragZone: removed the owner config"
- 2020-10-11T11:45:07Z @tobiu closed this issue

