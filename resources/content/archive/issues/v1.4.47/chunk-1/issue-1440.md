---
id: 1440
title: 'main.addon.DragDrop: onDragStart() store the dom rect of the drag proxy origin node'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-13T10:21:35Z'
updatedAt: '2020-11-13T10:33:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1440'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-13T10:33:19Z'
---
# main.addon.DragDrop: onDragStart() store the dom rect of the drag proxy origin node

*(No description provided)*

## Timeline

- 2020-11-13T10:21:35Z @tobiu added the `enhancement` label
- 2020-11-13T10:21:35Z @tobiu assigned to @tobiu
### @tobiu - 2020-11-13T10:27:06Z

actually this needs to happen only once onDragMove(), since we don't have the id onDragStart()

- 2020-11-13T10:33:08Z @tobiu referenced in commit `9edfae6` - "main.addon.DragDrop: onDragStart() store the dom rect of the drag proxy origin node #1440"
- 2020-11-13T10:33:20Z @tobiu closed this issue

