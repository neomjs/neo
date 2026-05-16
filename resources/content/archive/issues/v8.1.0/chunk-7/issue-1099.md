---
id: 1099
title: 'main.addon.DragDrop: add an (optional) containerId config to limit dragging inside the container boundaries'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-17T23:06:56Z'
updatedAt: '2020-08-18T12:46:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1099'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-18T12:46:46Z'
---
# main.addon.DragDrop: add an (optional) containerId config to limit dragging inside the container boundaries

=> adjust dragMove()

add the config to draggable.DragZone and pass it to the main thread (new remote method).

## Timeline

- 2020-08-17T23:06:56Z @tobiu added the `enhancement` label
- 2020-08-17T23:06:57Z @tobiu assigned to @tobiu
### @tobiu - 2020-08-18T12:46:46Z

boundaryContainerRect, fully implemented now

- 2020-08-18T12:46:46Z @tobiu closed this issue

