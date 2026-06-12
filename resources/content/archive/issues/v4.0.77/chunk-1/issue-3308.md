---
id: 3308
title: 'component.Base: syncVnodeTree() => parents update'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-07-20T09:03:47Z'
updatedAt: '2022-07-20T12:22:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3308'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-20T12:22:50Z'
---
# component.Base: syncVnodeTree() => parents update

there is a rare edge case, in which parents don't have a vnode yet (race condition).

while this should not happen in theory, adding a check to prevent errors feels needed.

## Timeline

- 2022-07-20T09:03:47Z @tobiu added the `bug` label
- 2022-07-20T09:03:47Z @tobiu assigned to @tobiu
- 2022-07-20T09:05:40Z @tobiu referenced in commit `e6a9151` - "component.Base: syncVnodeTree() => parents update #3308"
- 2022-07-20T09:05:45Z @tobiu closed this issue
- 2022-07-20T12:20:22Z @tobiu reopened this issue
### @tobiu - 2022-07-20T12:20:50Z

we can remove this check again => see https://github.com/neomjs/neo/issues/3312

- 2022-07-20T12:22:13Z @tobiu referenced in commit `7062baf` - "component.Base: syncVnodeTree() => parents update #3308"
- 2022-07-20T12:22:50Z @tobiu closed this issue

