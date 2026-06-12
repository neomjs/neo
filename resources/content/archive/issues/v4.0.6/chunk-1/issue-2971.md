---
id: 2971
title: manager.remotesApi
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-04-11T09:42:06Z'
updatedAt: '2022-04-15T19:52:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2971'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-04-15T19:52:16Z'
---
# manager.remotesApi

We need a new manager class to take care of the `worker.Data: onRpc()` calls. This is especially important in case we want to batch ajax calls which go to the same endpoint.

## Timeline

- 2022-04-11T09:42:07Z @tobiu added the `enhancement` label
- 2022-04-11T09:42:07Z @tobiu assigned to @tobiu
- 2022-04-11T09:46:28Z @tobiu referenced in commit `357f23f` - "manager.remotesApi #2971"
- 2022-04-11T10:01:38Z @tobiu referenced in commit `c3e95fd` - "#2971 worker.Data: moving rpc calls into manager.remotesApi"
- 2022-04-15T19:52:16Z @tobiu closed this issue

