---
id: 5623
title: 'plugin.Resizable: onDragStart() => initial proxy position'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-25T20:55:08Z'
updatedAt: '2024-07-25T20:57:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5623'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-25T20:57:47Z'
---
# plugin.Resizable: onDragStart() => initial proxy position

if i remember it right, `dialog.Base` had a wrapper node, which did get removed later on.

the resizable plugin is not honoring the change yet:
the proxy wrapper & content node can both get styles for height, left, top & width, leading to a wrong position.

@ExtAnimal 

## Timeline

- 2024-07-25T20:55:08Z @tobiu added the `enhancement` label
- 2024-07-25T20:55:08Z @tobiu assigned to @tobiu
- 2024-07-25T20:55:23Z @tobiu referenced in commit `9230275` - "plugin.Resizable: onDragStart() => initial proxy position #5623"
- 2024-07-25T20:57:47Z @tobiu closed this issue

