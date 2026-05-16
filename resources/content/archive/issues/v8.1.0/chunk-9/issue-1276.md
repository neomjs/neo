---
id: 1276
title: 'draggable.DragZone: createDragProxy() => add the closest theme'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-20T12:35:56Z'
updatedAt: '2020-10-20T12:49:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1276'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-20T12:49:13Z'
---
# draggable.DragZone: createDragProxy() => add the closest theme

we can grab the component matching to dragElement.id and in case it exists, apply its theme.

we could further enhance this in case the dragEl does not match a component (find the closest component first).
follow up ticket if needed.

## Timeline

- 2020-10-20T12:35:56Z @tobiu added the `enhancement` label
- 2020-10-20T12:35:56Z @tobiu assigned to @tobiu
- 2020-10-20T12:36:20Z @tobiu referenced in commit `d545b34` - "draggable.DragZone: createDragProxy() => add the closest theme #1276"
- 2020-10-20T12:49:13Z @tobiu closed this issue

