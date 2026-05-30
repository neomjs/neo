---
id: 1928
title: 'container.Base: moveTo()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-05-04T16:28:27Z'
updatedAt: '2021-05-04T16:42:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1928'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-04T16:42:52Z'
---
# container.Base: moveTo()

the method expects 2 is params.

since adding function based module configs (lazy loading views), it has become possible that items do not have an id yet.

the method needs to support item indexes as well.

this affects re-sorting tabs.

## Timeline

- 2021-05-04T16:28:27Z @tobiu added the `bug` label
- 2021-05-04T16:28:27Z @tobiu assigned to @tobiu
- 2021-05-04T16:42:50Z @tobiu referenced in commit `f721d53` - "container.Base: moveTo() #1928"
- 2021-05-04T16:42:52Z @tobiu closed this issue

