---
id: 6904
title: Neo.config.useDataWorkerEntryPoint
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-30T01:09:47Z'
updatedAt: '2025-06-30T01:17:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6904'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-30T01:17:51Z'
---
# Neo.config.useDataWorkerEntryPoint

* The app worker uses `app.mjs` as a starting point
* The canvas worker uses `canvas.mjs` as a starting point
* The task worker uses `task.mjs` as a starting point

=> it is only logical to allow the data worker to optionally use `data.mjs`, to allow devs to define services with remote method access in there.

## Timeline

- 2025-06-30T01:09:47Z @tobiu assigned to @tobiu
- 2025-06-30T01:09:48Z @tobiu added the `enhancement` label
- 2025-06-30T01:17:51Z @tobiu closed this issue

