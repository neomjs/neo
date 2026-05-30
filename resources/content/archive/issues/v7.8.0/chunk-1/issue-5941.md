---
id: 5941
title: 'plugin.Resizable: onDragStart() => polishing'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-21T08:36:08Z'
updatedAt: '2024-09-21T08:36:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5941'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T08:36:32Z'
---
# plugin.Resizable: onDragStart() => polishing

* pass `windowId` to the dragZone
* delete vdom `height` & `width` (configs of the same name do directly get mapped to the vdom, so just changing vdom.style is not enough
* adjust the proxy opacity to 0.7

## Timeline

- 2024-09-21T08:36:08Z @tobiu added the `enhancement` label
- 2024-09-21T08:36:08Z @tobiu assigned to @tobiu
- 2024-09-21T08:36:28Z @tobiu referenced in commit `993fb80` - "plugin.Resizable: onDragStart() => polishing #5941"
- 2024-09-21T08:36:32Z @tobiu closed this issue

