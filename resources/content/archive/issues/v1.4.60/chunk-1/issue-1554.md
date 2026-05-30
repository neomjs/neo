---
id: 1554
title: 'component.Base: updateStyle() => change the hasUnmountedVdomChanges config if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-21T16:08:38Z'
updatedAt: '2021-03-21T16:09:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1554'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T16:09:09Z'
---
# component.Base: updateStyle() => change the hasUnmountedVdomChanges config if needed

since we can change styles using a shortcut (not triggering the vdom engine), we need to flag the component in case it is not mounted while a call gets triggered.

## Timeline

- 2021-03-21T16:08:39Z @tobiu added the `enhancement` label
- 2021-03-21T16:08:39Z @tobiu assigned to @tobiu
- 2021-03-21T16:09:03Z @tobiu referenced in commit `b6f1878` - "component.Base: updateStyle() => change the hasUnmountedVdomChanges config if needed #1554"
- 2021-03-21T16:09:09Z @tobiu closed this issue

