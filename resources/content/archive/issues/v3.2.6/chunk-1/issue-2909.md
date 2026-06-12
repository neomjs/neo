---
id: 2909
title: 'worker.ServiceBase: onConnect()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-03-03T16:09:44Z'
updatedAt: '2022-03-03T16:17:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2909'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-03-03T16:17:29Z'
---
# worker.ServiceBase: onConnect()

since there is no "real" connect event for new clients, we need to e.g. (ab)use `onRegisterNeoConfig()`.

## Timeline

- 2022-03-03T16:09:44Z @tobiu added the `enhancement` label
- 2022-03-03T16:09:44Z @tobiu assigned to @tobiu
- 2022-03-03T16:12:08Z @tobiu referenced in commit `d2c1d11` - "worker.ServiceBase: onConnect() #2909"
- 2022-03-03T16:17:29Z @tobiu closed this issue

