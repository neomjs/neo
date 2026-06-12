---
id: 5131
title: 'worker.Manager: create a custom windowId'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-12-04T18:44:45Z'
updatedAt: '2023-12-04T19:12:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5131'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-04T19:12:43Z'
---
# worker.Manager: create a custom windowId

pass it to workers inside the `registerNeoConfig` call.

`worker.Base` needs to add the windowId to a matching port (SharedWorkers scope).

## Timeline

- 2023-12-04T18:44:45Z @tobiu added the `enhancement` label
- 2023-12-04T18:44:45Z @tobiu assigned to @tobiu
- 2023-12-04T18:46:21Z @tobiu referenced in commit `f64bd02` - "worker.Manager: create a custom windowId #5131"
- 2023-12-04T19:12:44Z @tobiu closed this issue

