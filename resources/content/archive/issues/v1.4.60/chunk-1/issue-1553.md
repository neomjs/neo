---
id: 1553
title: 'worker.Manager: appName => appNames'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-21T13:01:32Z'
updatedAt: '2021-03-21T13:02:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1553'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T13:02:39Z'
---
# worker.Manager: appName => appNames

since multiple apps can live within 1 browser window, the main thread bound worker.Manager needs an array of appNames.

onDisconnect() it needs to broadcast each app.

## Timeline

- 2021-03-21T13:01:32Z @tobiu added the `enhancement` label
- 2021-03-21T13:01:32Z @tobiu assigned to @tobiu
- 2021-03-21T13:02:31Z @tobiu referenced in commit `7a21672` - "worker.Manager: appName => appNames #1553"
- 2021-03-21T13:02:39Z @tobiu closed this issue

