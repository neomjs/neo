---
id: 3057
title: 'worker.ServiceBase: honor new neo versions'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-05-13T17:25:43Z'
updatedAt: '2024-09-15T02:36:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3057'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:03Z'
---
# worker.ServiceBase: honor new neo versions

* we need to store the neo-version inside the SW
* we need to store it inside the framework as well
* when an app connects, compare the versions
* if different, clear the SW related cache

for dist prod, the SW is storing the webpack based chunks. these can change for a new version and then break. in case you are running into it while exploring the online-examples, just unregister the SW inside the chrome devtools (top of the application tab)

## Timeline

- 2022-05-13T17:25:43Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-31T02:26:02Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:03Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:03Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:03Z @github-actions closed this issue

