---
id: 2918
title: 'worker.ServiceBase: initRemote()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-03-07T13:03:28Z'
updatedAt: '2022-03-07T13:05:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2918'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-03-07T13:05:16Z'
---
# worker.ServiceBase: initRemote()

we need to ensure that this method only gets triggered once per client (edge case when registering a SW for the first time).

## Timeline

- 2022-03-07T13:03:28Z @tobiu added the `enhancement` label
- 2022-03-07T13:03:28Z @tobiu assigned to @tobiu
- 2022-03-07T13:04:50Z @tobiu referenced in commit `ef97e94` - "worker.ServiceBase: initRemote() #2918"
- 2022-03-07T13:05:16Z @tobiu closed this issue

