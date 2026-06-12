---
id: 2910
title: 'worker.ServiceBase: onConnect() => trigger initRemote()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-03-03T16:21:15Z'
updatedAt: '2022-03-03T18:26:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2910'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-03-03T18:26:57Z'
---
# worker.ServiceBase: onConnect() => trigger initRemote()

we can not rely on `construct()`, since we will connect to an already existing SW in most cases.

## Timeline

- 2022-03-03T16:21:15Z @tobiu added the `enhancement` label
- 2022-03-03T16:21:16Z @tobiu assigned to @tobiu
- 2022-03-03T18:26:20Z @tobiu referenced in commit `c95f596` - "worker.ServiceBase: onConnect() => trigger initRemote() #2910"
- 2022-03-03T18:26:57Z @tobiu closed this issue

