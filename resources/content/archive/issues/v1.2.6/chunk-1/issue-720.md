---
id: 720
title: 'component.Base: afterSetMounted()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-14T15:17:53Z'
updatedAt: '2020-06-14T15:29:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/720'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T15:29:39Z'
---
# component.Base: afterSetMounted()

we should move the child related logic into container.Base.

=> we don't need to parse all child items here, but just use the direct child items instead.

## Timeline

- 2020-06-14T15:17:53Z @tobiu added the `enhancement` label
- 2020-06-14T15:17:54Z @tobiu assigned to @tobiu
- 2020-06-14T15:29:05Z @tobiu referenced in commit `a85d7eb` - "component.Base: afterSetMounted() #720"
- 2020-06-14T15:29:39Z @tobiu closed this issue

